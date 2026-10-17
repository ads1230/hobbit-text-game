# Resource fork reader: dumps every resource to res/<TYPE>/<id>[_name].bin and returns an index.
import struct, os, sys, json
def read_rsrc(path):
    d=open(path,'rb').read()
    dataOff,mapOff,dataLen,mapLen=struct.unpack('>IIII',d[:16])
    m=mapOff; tl=m+struct.unpack('>H',d[m+24:m+26])[0]; nl=m+struct.unpack('>H',d[m+26:m+28])[0]
    n=struct.unpack('>H',d[tl:tl+2])[0]+1
    out={}
    for i in range(n):
        e=tl+2+i*8; t=d[e:e+4].decode('mac_roman'); cnt=struct.unpack('>H',d[e+4:e+6])[0]+1; ro=struct.unpack('>H',d[e+6:e+8])[0]
        for j in range(cnt):
            r=tl+ro+j*12; rid=struct.unpack('>h',d[r:r+2])[0]; nameOff=struct.unpack('>h',d[r+2:r+4])[0]; attr=d[r+4]
            off=struct.unpack('>I',b'\0'+d[r+5:r+8])[0]; ln=struct.unpack('>I',d[dataOff+off:dataOff+off+4])[0]
            nm=''
            if nameOff!=-1:
                p=nl+nameOff; nm=d[p+1:p+1+d[p]].decode('mac_roman','replace')
            out.setdefault(t,{})[rid]={'name':nm,'attr':attr,'data':d[dataOff+off+4:dataOff+off+4+ln]}
    return out
if __name__=='__main__':
    res=read_rsrc(sys.argv[1]); outdir=sys.argv[2]
    index={}
    for t,items in res.items():
        tdir=os.path.join(outdir,t.replace(' ','_').replace('#','num'))
        os.makedirs(tdir,exist_ok=True)
        for rid,r in items.items():
            fn='%d%s.bin'%(rid,('_'+r['name'].replace(' ','_').replace('/','_')) if r['name'] else '')
            open(os.path.join(tdir,fn),'wb').write(r['data'])
            index.setdefault(t,{})[rid]={'name':r['name'],'size':len(r['data']),'file':os.path.join(tdir,fn)}
    json.dump(index,open(os.path.join(outdir,'index.json'),'w'),indent=1)
    print('dumped',sum(len(v) for v in index.values()),'resources')
