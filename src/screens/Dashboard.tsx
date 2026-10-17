import React, { useMemo } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { ArrowDownRight, ArrowRight, CalendarDays, ChevronRight, CircleHelp, Clock3, Leaf, Pause, Play, ShieldCheck, Sparkles, Target } from 'lucide-react-native';
import { useAppStore } from '../store/useAppStore';
import { calculateSummary, formatDuration } from '../domain/analytics';
import { useTheme } from '../theme/ThemeProvider';
import { useWorkspace } from '../hooks/useWorkspace';
import { AppIcon, Button, Card, EmptyState, Entrance, IconButton, OrbitArt, Page, PageHeading, ProgressRing, Row, SectionTitle, Tag, Txt } from '../components/ui';
import { useNow } from '../hooks/useDevice';
import { WeeklyChart } from '../components/charts';

export default function Dashboard() {
  const t=useTheme(); const {width}=useWindowDimensions(); const mobile=width<700;
  const {date,setDate,navigate,showFocus,showLimit,showDate}=useWorkspace();
  const {sessions,apps,preferences,limits,sampleMode,focus,pauseFocus,resumeFocus}=useAppStore();
  const summary=useMemo(()=>calculateSummary(sessions,date,preferences.dailyGoalMinutes),[sessions,date,preferences.dailyGoalMinutes]);
  const total=summary.totalMinutes; const remaining=Math.max(0,preferences.dailyGoalMinutes-total); const percent=total/preferences.dailyGoalMinutes;
  const saved=Math.max(0,summary.previousDayMinutes-total); const change=summary.previousDayMinutes ? Math.round((total-summary.previousDayMinutes)/summary.previousDayMinutes*100) : null;
  const ranked=apps.map(app=>({...app,minutes:summary.appMinutes[app.id]??0})).sort((a,b)=>b.minutes-a.minutes);
  const isToday=new Date(date).toDateString()===new Date().toDateString();
  const dateLabel=isToday?'Today':new Date(date).toLocaleDateString('en-US',{month:'short',day:'numeric'});
  const activeFocus=focus&&(focus.status==='active'||focus.status==='paused');
  const now=useNow(!!activeFocus);
  const focusSeconds=focus?Math.max(0,Math.ceil((focus.status==='paused'?(focus.remainingOnPause??0):focus.endsAt-now)/1000)):0;
  return <Page>
    <Entrance><PageHeading eyebrow="A LITTLE MORE INTENTION, EVERY DAY" title="Less scrolling. More living." subtitle="Make room for the things that matter to you."><Pressable onPress={showDate} accessibilityRole="button" accessibilityLabel="Choose dashboard date" style={{ flexDirection:'row',alignItems:'center',gap:10,padding:11,paddingHorizontal:14,borderWidth:1,borderColor:t.border,borderRadius:10,backgroundColor:t.surface }}><CalendarDays size={15} color={t.secondary}/><Txt size={12} weight="medium">{dateLabel}, {new Date(date).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</Txt><ChevronRight size={14} color={t.muted}/></Pressable></PageHeading></Entrance>
    <Entrance delay={60} style={{ flexDirection:mobile?'column':'row',gap:20 }}>
      <Card style={{flex:1.65,padding:mobile?22:28,minHeight:268}}>
        <Row style={{justifyContent:'space-between'}}><Row style={{gap:8}}><View style={{width:7,height:7,borderRadius:4,backgroundColor:t.accent}}/><Txt size={10} weight="semibold" color={t.secondary} style={{letterSpacing:1.2}}>{isToday?"TODAY’S":"DAILY"} SCREEN TIME</Txt></Row><Tag tone={percent<=1?'green':'red'} dot>{percent<=1?'Within your goal':'Over your goal'}</Tag></Row>
        <Row style={{flex:1,justifyContent:'space-between',gap:10,marginTop:13,marginBottom:10}}>
          <View style={{flex:1}}><Row style={{alignItems:'baseline',gap:5}}><Txt size={mobile?44:52} weight="display" style={{letterSpacing:-2.8,lineHeight:68}}>{Math.floor(total/60)}</Txt><Txt size={24} color={t.muted} style={{marginRight:5}}>h</Txt><Txt size={mobile?44:52} weight="display" style={{letterSpacing:-2.8,lineHeight:68}}>{Math.round(total%60).toString().padStart(2,'0')}</Txt><Txt size={24} color={t.muted}>m</Txt></Row>
            <Row style={{gap:5,marginTop:6,flexWrap:'wrap'}}>{change!==null?<><ArrowDownRight size={15} color={change<=0?t.green:t.red} style={{transform:[{rotate:change<=0?'0deg':'-90deg'}]}}/><Txt size={11} color={change<=0?t.green:t.red} weight="medium">{Math.abs(change)}% {change<=0?'less':'more'}</Txt><Txt size={11} color={t.muted}>than yesterday</Txt></>:<Txt size={11} color={t.muted}>Your daily picture starts here</Txt>}</Row>
            <Row style={{gap:6,marginTop:20}}><Target size={13} color={t.muted}/><Txt size={11} color={t.secondary}>Daily goal</Txt><Txt size={11} weight="semibold">{formatDuration(preferences.dailyGoalMinutes)}</Txt></Row>
          </View>
          <ProgressRing value={percent} size={mobile?135:164}><Txt size={28} weight="display" style={{letterSpacing:-1}}>{Math.round(percent*100)}<Txt size={16} color={t.muted}>%</Txt></Txt><Txt size={10} color={t.muted}>of daily goal</Txt></ProgressRing>
        </Row>
        <Row style={{borderTopWidth:1,borderColor:t.border,paddingTop:16,gap:7}}><Leaf size={14} color={t.green}/><Txt size={11} color={t.secondary} style={{flex:1}}>{percent<=1?<><Txt size={11} weight="semibold" color={t.green}>{formatDuration(remaining)} left</Txt> to spend mindfully. You’re doing well.</>:<>A good moment to put your phone down.</>}</Txt><IconButton label="Edit daily goal" icon={ArrowRight} onPress={()=>navigate('Settings')} style={{height:22,width:25}}/></Row>
      </Card>
      <View style={{flex:1,minHeight:268,backgroundColor:'#2C3046',borderRadius:20,padding:26,overflow:'hidden',justifyContent:'space-between'}}>
        <View pointerEvents="none" style={{position:'absolute',right:-42,top:-44,opacity:0.85}}><OrbitArt size={225}/></View>
        <Row style={{gap:7}}><Sparkles size={13} color="#C8BCE9"/><Txt size={9} color="#CDC4E7" weight="medium" style={{letterSpacing:1.2}}>A MOMENT FOR YOU</Txt></Row>
        <View style={{marginTop:22,marginBottom:22}}><Txt color="#FFF" size={activeFocus?35:27} weight="display" style={{letterSpacing:-0.7}}>{activeFocus?`${Math.floor(focusSeconds/60).toString().padStart(2,'0')}:${(focusSeconds%60).toString().padStart(2,'0')}`:'Find your focus.'}</Txt><Txt color="#B6B8CA" size={12} style={{marginTop:7,maxWidth:235,lineHeight:19}}>{activeFocus?(focus.status==='paused'?'Take a breath. Continue when you’re ready.':'One thing at a time. This moment is yours.'):'A little distance from your apps.\nA little closer to your day.'}</Txt></View>
        <Button title={activeFocus?(focus.status==='paused'?'Resume session':'Pause session'):'Start a focus session'} variant="white" icon={activeFocus?(focus.status==='paused'?Play:Pause):Play} onPress={activeFocus?()=>{void (focus.status==='paused'?resumeFocus():pauseFocus());}:showFocus} style={{alignSelf:'stretch'}}/>
        <Txt color="#999CB2" size={9} style={{textAlign:'center',marginTop:10}}>{activeFocus?'Your timer continues when you leave this screen':`${preferences.defaultFocusMinutes} minutes of being a little more present`}</Txt>
      </View>
    </Entrance>
    <Entrance delay={100} style={{flexDirection:mobile?'column':'row',gap:14}}>
      {[
        {icon:Clock3,label:'Viewing sessions',value:String(summary.sessionCount),note:'App visits, not individual videos',color:t.accent,bg:t.accentSoft},
        {icon:Leaf,label:'Time reclaimed',value:formatDuration(saved),note:saved>0?'A little more life than yesterday':'Compared with yesterday',color:t.green,bg:t.greenSoft},
        {icon:ShieldCheck,label:'Mindful boundaries',value:String(limits.filter(l=>l.enabled).length).padStart(2,'0'),note:sampleMode?'App limits in your sample plan':'App limits in your local plan',color:'#C19558',bg:t.isDark?'#3C352C':'#FAF4E9'},
      ].map((metric,i)=><Card key={metric.label} style={{flex:1,padding:19,flexDirection:'row',alignItems:'center',gap:15}}><View style={{width:42,height:42,borderRadius:13,backgroundColor:metric.bg,alignItems:'center',justifyContent:'center'}}><metric.icon size={19} color={metric.color} strokeWidth={1.6}/></View><View style={{flex:1}}><Txt size={11} color={t.secondary}>{metric.label}</Txt><Row style={{alignItems:'baseline',gap:8}}><Txt size={25} weight="display" style={{letterSpacing:-0.7}}>{metric.value}</Txt>{i===1&&saved>0&&<Txt size={10} color={t.green}>well spent</Txt>}</Row><Txt size={9} color={t.muted}>{metric.note}</Txt></View></Card>)}
    </Entrance>
    <Entrance delay={150} style={{flexDirection:mobile?'column':'row',gap:20}}>
      <Card style={{flex:1.4,padding:24}}><SectionTitle title="The bigger picture" subtitle="A little progress adds up." action="View insights" onAction={()=>navigate('Insights')}/><Row style={{justifyContent:'space-between',marginTop:0,marginBottom:10}}><Row style={{alignItems:'baseline',gap:7}}><Txt size={25} weight="display" style={{letterSpacing:-0.8}}>{formatDuration(summary.weekDays.reduce((s,d)=>s+d.minutes,0))}</Txt><Txt size={10} color={t.muted}>this week</Txt></Row><Row style={{gap:5}}><View style={{width:6,height:6,borderRadius:3,backgroundColor:t.accent}}/><Txt size={10} color={t.muted}>Screen time</Txt></Row></Row><WeeklyChart days={summary.weekDays} goal={preferences.dailyGoalMinutes} selectedDate={date} onSelect={setDate}/></Card>
      <Card style={{flex:1,padding:24}}><SectionTitle title="Where your time goes" subtitle="Your most-visited spaces." action="All apps" onAction={()=>navigate('App limits')}/>{total===0?<EmptyState title="A fresh start" description="Connect usage access in Settings to start seeing your day." icon={Clock3} action="Connect your device" onAction={()=>navigate('Settings')}/>:<View style={{gap:19,marginTop:4}}>{ranked.map((app,i)=><Pressable accessibilityRole="button" accessibilityLabel={`Set limit for ${app.name}`} key={app.id} onPress={()=>showLimit(app.id)} style={{flexDirection:'row',alignItems:'center',gap:12}}><AppIcon id={app.id} size={36}/><View style={{flex:1,gap:7}}><Row style={{justifyContent:'space-between',gap:6}}><Txt size={12} weight="medium">{app.name}</Txt><Txt size={11} color={t.secondary} weight="medium">{formatDuration(app.minutes)}</Txt></Row><View style={{height:4,backgroundColor:t.track,borderRadius:4}}><View style={{width:`${Math.max(0,app.minutes/Math.max(total,1)*100)}%`,height:4,borderRadius:4,backgroundColor:['#A490D3','#D6A0BA','#8595BF','#90B6BC'][i]}}/></View></View></Pressable>)}</View>}<Row style={{marginTop:21,gap:5}}><CircleHelp size={11} color={t.muted}/><Txt size={9} color={t.muted}>Time in apps. Individual video counts aren’t available.</Txt></Row></Card>
    </Entrance>
    <Entrance delay={180}><View style={{borderWidth:1,borderColor:t.isDark?t.border:'#E5EAE5',backgroundColor:t.isDark?t.surface:'#F0F4F0',borderRadius:14,padding:19,flexDirection:'row',alignItems:'center',gap:14}}><View style={{width:36,height:36,borderRadius:12,backgroundColor:t.isDark?t.greenSoft:'#E4ECE2',alignItems:'center',justifyContent:'center'}}><Leaf size={19} color={t.green} strokeWidth={1.5}/></View><View style={{flex:1}}><Txt size={12} weight="semibold">Your attention is a little garden.</Txt><Txt size={11} color={t.secondary} style={{marginTop:3}}>What you give it to is what grows. A small boundary today can make space for something good.</Txt></View>{!mobile&&<Button title="Set a boundary" variant="ghost" icon={ArrowRight} small onPress={()=>showLimit()}/>}</View></Entrance>
    <Row style={{justifyContent:'center',gap:5,marginTop:0}}><ShieldCheck size={10} color={t.muted}/><Txt size={9} color={t.muted}>Only on your device. Always yours.</Txt></Row>
  </Page>;
}
