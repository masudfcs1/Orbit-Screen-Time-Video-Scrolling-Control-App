import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Row, Txt } from './ui';
import { formatDuration } from '../domain/analytics';

export type ChartDay = { date: number | string; label: string; minutes: number };
export function WeeklyChart({ days, goal, selectedDate, onSelect, tall = false }: { days: ChartDay[]; goal: number; selectedDate?: number; onSelect?: (timestamp: number) => void; tall?: boolean }) {
  const t=useTheme(); const [hover, setHover]=useState<number|null>(null);
  const max=Math.max(goal * 1.3, ...days.map(day=>day.minutes),60); const chartHeight=tall?210:150;
  const [today]=useState(()=>Date.now());
  const active=hover ?? days.findIndex(d=>new Date(d.date).toDateString()===new Date(selectedDate??today).toDateString());
  return <View style={{ paddingTop: 13 }}><View style={{ height:chartHeight+35, flexDirection:'row', gap:12 }}><View style={{ width:29, height:chartHeight, justifyContent:'space-between' }}>{[max,max/2,0].map((n,i)=><Txt key={i} size={9} color={t.muted}>{n===0?'0':`${Math.round(n/60*10)/10}h`}</Txt>)}</View><View style={{flex:1}}><View pointerEvents="none" style={{ position:'absolute',top:0,bottom:35,left:0,right:0,justifyContent:'space-between' }}>{[0,1,2].map(i=><View key={i} style={{borderBottomWidth:1,borderColor:t.border,...(i===1?{borderStyle:'dashed' as const}:{})}}/>)}</View><View pointerEvents="none" style={{position:'absolute',top:chartHeight*(1-goal/max),left:0,right:0,borderTopWidth:1,borderStyle:'dashed',borderColor:t.accent+'60'}}/><Row style={{height:chartHeight+35,alignItems:'flex-end',justifyContent:'space-around',gap:10}}>{days.map((day,i)=> <Pressable key={String(day.date)} onHoverIn={()=>setHover(i)} onHoverOut={()=>setHover(null)} accessibilityRole="button" accessibilityLabel={`${day.label}, ${formatDuration(day.minutes)}`} onPress={()=>onSelect?.(new Date(day.date).getTime())} style={{flex:1,maxWidth:days.length>10?32:56,height:chartHeight+35,alignItems:'center',justifyContent:'flex-end'}}>{active===i && <View style={{position:'absolute',bottom:Math.min(chartHeight-17,Math.max(4,day.minutes/max*chartHeight))+40,backgroundColor:t.ink,paddingHorizontal:7,paddingVertical:4,borderRadius:5,zIndex:5,minWidth:52,alignItems:'center'}}><Txt size={9} color={t.surface} weight="medium">{formatDuration(day.minutes)}</Txt></View>}<View style={{width:'67%',height:Math.max(day.minutes>0?5:0,day.minutes/max*(chartHeight-8)),backgroundColor:active===i?t.accent:t.isDark?'#48405F':'#DDD6F0',borderTopLeftRadius:5,borderTopRightRadius:5}}/><View style={{height:35,justifyContent:'flex-end',paddingBottom:2}}><Txt size={10} color={active===i?t.ink:t.muted} weight={active===i?'semibold':'regular'}>{day.label}</Txt></View></Pressable>)}</Row></View></View></View>;
}
export function MiniSparkline({ values, positive = true }: { values: number[]; positive?: boolean }) {
  const t=useTheme(); const max=Math.max(...values,1);
  return <Row style={{height:32,alignItems:'flex-end',gap:3}}>{values.map((v,i)=><View key={i} style={{height:Math.max(5,v/max*32),width:6,borderRadius:2,backgroundColor:positive?t.green:t.accent,opacity:0.2+i/(values.length*1.3)}}/>)}</Row>;
}
