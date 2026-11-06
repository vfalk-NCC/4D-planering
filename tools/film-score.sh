#!/bin/bash
# Synthesised ambient score for the product film (90 s) – no samples, pure ffmpeg synthesis. Usage: tools/film-score.sh out.wav
out=${1:-score.wav}
note='if(eq(m,0),220,if(eq(m,1),261.63,if(eq(m,2),329.63,if(eq(m,3),392,if(eq(m,4),440,if(eq(m,5),329.63,if(eq(m,6),261.63,196)))))))'
pl="aevalsrc='st(0,mod(floor(t/.5),8)); st(1,mod(t,.5)); m=ld(0); 0.16*sin(2*PI*${note}*t)*exp(-6*ld(1))*(1-exp(-80*ld(1)))':d=90:s=48000"
pl=${pl//m=ld(0)/}   # (m is read through ld(0) below)
pl="aevalsrc='st(0,mod(floor(t/.5),8)); st(1,mod(t,.5)); 0.16*sin(2*PI*(if(eq(ld(0),0),220,if(eq(ld(0),1),261.63,if(eq(ld(0),2),329.63,if(eq(ld(0),3),392,if(eq(ld(0),4),440,if(eq(ld(0),5),329.63,if(eq(ld(0),6),261.63,196))))))))*t)*exp(-6*ld(1))*(1-exp(-80*ld(1)))':d=90:s=48000"
ffmpeg -y -loglevel error \
 -f lavfi -i "sine=f=55:d=90:r=48000" -f lavfi -i "sine=f=82.41:d=90:r=48000" -f lavfi -i "sine=f=110:d=90:r=48000" \
 -f lavfi -i "sine=f=220.4:d=90:r=48000" -f lavfi -i "sine=f=329.9:d=90:r=48000" -f lavfi -i "sine=f=261.9:d=90:r=48000" \
 -f lavfi -i "anoisesrc=d=90:c=pink:a=0.5:r=48000" -f lavfi -i "$pl" \
 -f lavfi -i "aevalsrc='0.9*sin(2*PI*(46-8*t)*t)*exp(-2.2*t)':d=4:s=48000" \
 -filter_complex "
 [0]volume='0.5*min(1,t/3)':eval=frame[a0];
 [1]volume='0.28*min(1,t/6)':eval=frame,tremolo=f=0.25:d=0.5[a1];
 [2]volume='0.16*clip((t-4)/8,0,1)':eval=frame,tremolo=f=0.18:d=0.6[a2];
 [3]volume='0.07*clip((t-10)/6,0,1)':eval=frame,tremolo=f=0.3:d=0.7[a3];
 [4]volume='0.05*clip((t-20)/8,0,1)':eval=frame,tremolo=f=0.22:d=0.8[a4];
 [5]volume='0.05*clip((t-35)/10,0,1)':eval=frame,tremolo=f=0.2:d=0.8[a5];
 [6]highpass=f=900,lowpass=f=7000,volume='0.35*(clip((t-6.5)/3.7,0,1)*lt(t,10.2)+clip((t-57)/3,0,1)*lt(t,60.2)+clip((t-80.5)/2.5,0,1)*lt(t,83))':eval=frame[a6];
 [7]volume='if(gte(t,20),1,0)*clip((t-20)/3,0,1)*if(lt(t,60),1,if(lt(t,73),.0,1))*if(gt(t,84),clip(1-(t-84)/5,0,1),1)':eval=frame[a7];
 [8]adelay=10200|10200[a8];
 [a0][a1][a2][a3][a4][a5][a6][a7][a8]amix=inputs=9:normalize=0,aecho=0.8:0.7:420|700:0.28|0.18,afade=t=in:d=2,afade=t=out:st=86:d=4,loudnorm=I=-18:TP=-2" -ar 48000 -c:a pcm_s16le "$out"
