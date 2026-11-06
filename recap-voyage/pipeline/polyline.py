import json, math
def decode(s):
    i=lat=lng=0; out=[]
    while i<len(s):
        for k in range(2):
            sh=r=0
            while True:
                b=ord(s[i])-63; i+=1; r|=(b&0x1f)<<sh; sh+=5
                if b<0x20: break
            d=~(r>>1) if r&1 else r>>1
            if k==0: lat+=d
            else: lng+=d
        out.append((lat/1e5,lng/1e5))
    return out
def hav(a,b):
    R=6371000;p1,p2=math.radians(a[0]),math.radians(b[0]);dl=math.radians(b[1]-a[1]);dp=p2-p1
    return 2*R*math.asin(math.sqrt(math.sin(dp/2)**2+math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2))
