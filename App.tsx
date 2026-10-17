import './global.css';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, View, useWindowDimensions } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useFonts } from 'expo-font';
import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold } from '@expo-google-fonts/dm-sans';
import { Manrope_600SemiBold, Manrope_700Bold } from '@expo-google-fonts/manrope';
import { StatusBar } from 'expo-status-bar';
import { ArrowRight, ChartNoAxesCombined, ChevronRight, Grid2X2, Leaf, LockKeyhole, Moon, Settings2, Shield, Sun, Timer } from 'lucide-react-native';
import { ThemeProvider, useTheme } from './src/theme/ThemeProvider';
import { useAppStore } from './src/store/useAppStore';
import { WorkspaceContext, type ScreenName } from './src/hooks/useWorkspace';
import { DeviceProvider } from './src/hooks/useDevice';
import { Button, Card, IconButton, OrbitMark, Row, Tag, Toast, Txt } from './src/components/ui';
import { Dialogs, type Dialog } from './src/components/Dialogs';
import Dashboard from './src/screens/Dashboard';
import Insights from './src/screens/Insights';
import Limits from './src/screens/Limits';
import Settings from './src/screens/Settings';

type Routes = { Overview: undefined; Insights: undefined; 'App limits': undefined; Settings: undefined };
const Stack=createNativeStackNavigator<Routes>();
const navigationItems=[{name:'Overview' as const,icon:Grid2X2},{name:'Insights' as const,icon:ChartNoAxesCombined},{name:'App limits' as const,icon:Shield},{name:'Settings' as const,icon:Settings2}];

class ErrorBoundary extends React.Component<React.PropsWithChildren,{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){if(this.state.failed)return <View style={{flex:1,padding:30,justifyContent:'center',alignItems:'center',backgroundColor:'#F6F7F9'}}><Txt size={24} weight="bold">Let’s take a breath.</Txt><Txt style={{marginVertical:15,textAlign:'center'}}>Orbit couldn’t load this view. Your saved data is still on this device.</Txt><Button title="Try again" onPress={()=>this.setState({failed:false})}/></View>;return this.props.children;}
}

function Workspace(){
  const t=useTheme();const {width}=useWindowDimensions();const desktop=width>=900;
  const ref=useNavigationContainerRef<Routes>();const [screen,setScreen]=useState<ScreenName>('Overview');const [date,setDate]=useState(()=>Date.now());const [dialog,setDialog]=useState<Dialog>(null);const [message,setMessage]=useState<string|null>(null);
  const {hydrated,sampleMode,setPreferences}=useAppStore();
  const notify=useCallback((text:string)=>setMessage(text),[]);const dismiss=useCallback(()=>setMessage(null),[]);
  const navigate=useCallback((name:ScreenName)=>{if(ref.isReady())ref.navigate(name);setScreen(name);},[ref]);
  const workspace=useMemo(()=>({date,setDate,navigate,showFocus:()=>setDialog({type:'focus'}),showLimit:(appId?:string)=>setDialog({type:'limit',appId}),showSchedule:()=>setDialog({type:'schedule'}),showDate:()=>setDialog({type:'date'}),notify}),[date,navigate,notify]);
  useEffect(()=>useAppStore.subscribe(state=>{if(state.error){notify(state.error);state.clearError();}}),[notify]);
  const theme={...DefaultTheme,dark:t.isDark,colors:{...DefaultTheme.colors,background:t.background,card:t.surface,text:t.ink,border:t.border,primary:t.accent}};
  const navItem=(item:typeof navigationItems[number],bottom=false)=><Pressable key={item.name} accessibilityRole="tab" accessibilityState={{selected:screen===item.name}} onPress={()=>navigate(item.name)} style={({pressed})=>({flexDirection:bottom?'column':'row',alignItems:'center',gap:bottom?5:13,paddingHorizontal:bottom?10:16,paddingVertical:bottom?12:13,borderRadius:10,backgroundColor:screen===item.name&&!bottom?t.accentSoft:pressed?t.surfaceAlt:'transparent',flex:bottom?1:undefined})}><item.icon size={bottom?21:19} color={screen===item.name?t.accent:t.muted} strokeWidth={screen===item.name?1.9:1.65}/><Txt size={bottom?9:13} color={screen===item.name?t.accent:t.secondary} weight={screen===item.name?'semibold':'regular'}>{item.name}</Txt>{!bottom&&screen===item.name&&<View style={{marginLeft:'auto',width:5,height:5,borderRadius:3,backgroundColor:t.accent}}/>}</Pressable>;
  return <WorkspaceContext.Provider value={workspace}><SafeAreaView edges={['top','bottom']} style={{flex:1,backgroundColor:t.surface}}><StatusBar style={t.isDark?'light':'dark'}/><NavigationContainer ref={ref} theme={theme} linking={Platform.OS==='web'?{prefixes:[],config:{screens:{Overview:'',Insights:'insights','App limits':'limits',Settings:'settings'}}}:undefined} onStateChange={()=>setScreen((ref.getCurrentRoute()?.name??'Overview') as ScreenName)} onReady={()=>setScreen((ref.getCurrentRoute()?.name??'Overview') as ScreenName)}><View className="flex-1 flex-row" style={{flex:1,flexDirection:'row'}}>
    {desktop&&<View style={{width:226,backgroundColor:t.surface,borderRightWidth:1,borderColor:t.border,paddingHorizontal:21,paddingTop:32,paddingBottom:20}}><Row style={{gap:9,marginLeft:10}}><OrbitMark size={36}/><Txt weight="bold" size={29} style={{letterSpacing:-1.3}}>orbit<Txt color={t.accent} size={27}>.</Txt></Txt></Row><Txt size={9} color={t.muted} style={{marginLeft:15,marginTop:5,letterSpacing:1.25}}>MAKE ROOM FOR REAL LIFE</Txt><View style={{marginTop:54,gap:6}}><Txt size={9} color={t.muted} weight="medium" style={{letterSpacing:1.6,marginBottom:10,marginLeft:16}}>YOUR WORKSPACE</Txt>{navigationItems.map(item=>navItem(item))}</View><View style={{flex:1,minHeight:50}}/><View style={{backgroundColor:t.surfaceAlt,borderWidth:1,borderColor:t.border,borderRadius:16,padding:17,marginBottom:22}}><View style={{backgroundColor:t.greenSoft,width:32,height:32,borderRadius:10,alignItems:'center',justifyContent:'center',marginBottom:13}}><Leaf color={t.green} size={17}/></View><Txt size={12} weight="semibold">A pause is productive.</Txt><Txt size={10} color={t.muted} style={{marginTop:6,lineHeight:17}}>You don’t have to be available to everything, all the time.</Txt><Pressable accessibilityRole="button" onPress={workspace.showFocus} style={{flexDirection:'row',alignItems:'center',gap:6,marginTop:16}}><Txt size={11} color={t.accent} weight="semibold">Take a little break</Txt><ArrowRight size={13} color={t.accent}/></Pressable></View><Row style={{borderTopWidth:1,borderColor:t.border,paddingTop:19,gap:11,paddingLeft:5}}><View style={{width:33,height:33,borderRadius:11,backgroundColor:t.accentSoft,alignItems:'center',justifyContent:'center'}}><LockKeyhole color={t.accent} size={15}/></View><View><Txt size={11} weight="semibold">Your personal space</Txt><Txt size={9} color={t.muted} style={{marginTop:2}}>Private. Local. Yours.</Txt></View></Row></View>}
    <View style={{flex:1,minWidth:0}}><Row style={{height:72,borderBottomWidth:1,borderColor:t.border,backgroundColor:t.surface,paddingHorizontal:desktop?36:20,justifyContent:'space-between'}}>{desktop?<Row style={{gap:10}}><Txt color={t.muted} size={11}>Your workspace</Txt><ChevronRight color={t.muted} size={12}/><Txt size={11} weight="medium">{screen}</Txt></Row>:<Row style={{gap:6}}><OrbitMark size={29}/><Txt size={24} weight="bold" style={{letterSpacing:-1}}>orbit.</Txt></Row>}<Row style={{gap:desktop?17:10}}>{sampleMode?<Pressable accessibilityRole="button" accessibilityLabel="Sample data information" onPress={()=>navigate('Settings')}><Tag dot>Sample data</Tag></Pressable>:<Tag tone="green" dot>On this device</Tag>}<View style={{height:19,width:1,backgroundColor:t.border}}/><IconButton icon={t.isDark?Sun:Moon} label={t.isDark?'Switch to light theme':'Switch to dark theme'} onPress={()=>{void setPreferences({theme:t.isDark?'light':'dark'}).catch(()=>{});}}/>{desktop&&<Button title="Focus time" variant="secondary" icon={Timer} small onPress={workspace.showFocus}/>}</Row></Row>
      {!hydrated?<View style={{flex:1,backgroundColor:t.background,padding:36,gap:20}}><View style={{height:70,width:'65%',borderRadius:15,backgroundColor:t.border}}/><Row style={{gap:20}}><Card style={{height:268,flex:1.6}}/><Card style={{height:268,flex:1}}/></Row><ActivityIndicator color={t.accent}/></View>:<Stack.Navigator initialRouteName="Overview" screenOptions={{headerShown:false,animation:'fade',contentStyle:{backgroundColor:t.background}}}><Stack.Screen name="Overview" component={Dashboard}/><Stack.Screen name="Insights" component={Insights}/><Stack.Screen name="App limits" component={Limits}/><Stack.Screen name="Settings" component={Settings}/></Stack.Navigator>}
      {!desktop&&<Row style={{backgroundColor:t.surface,borderTopWidth:1,borderColor:t.border,paddingHorizontal:10}}>{navigationItems.map(item=>navItem(item,true))}</Row>}
    </View>
  </View></NavigationContainer><Dialogs key={dialog?dialog.type+(dialog.type==='limit'?dialog.appId??'':''):'closed'} dialog={dialog} onClose={()=>setDialog(null)}/><Toast message={message} onClose={dismiss}/></SafeAreaView></WorkspaceContext.Provider>;
}

export default function App(){
  const [loaded,fontError]=useFonts({DMSans_400Regular,DMSans_500Medium,DMSans_600SemiBold,Manrope_600SemiBold,Manrope_700Bold});
  useEffect(()=>{void useAppStore.getState().hydrate().catch(()=>{});},[]);
  if(!loaded&&!fontError)return <View style={{flex:1,backgroundColor:'#F6F7F9',justifyContent:'center',alignItems:'center'}}><ActivityIndicator color="#8570D9"/></View>;
  return <GestureHandlerRootView style={{flex:1}}><SafeAreaProvider><ThemeProvider><ErrorBoundary><DeviceProvider><Workspace/></DeviceProvider></ErrorBoundary></ThemeProvider></SafeAreaProvider></GestureHandlerRootView>;
}
