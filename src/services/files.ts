import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { MAX_BACKUP_BYTES } from '../domain/backup';

export async function saveLocalText(text: string, filename: string, mimeType='application/json') {
  if(Platform.OS==='web'){
    const url=URL.createObjectURL(new Blob([text],{type:mimeType}));
    const link=document.createElement('a');link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);return;
  }
  const file=new File(Paths.cache,filename);file.write(text);
  if(!await Sharing.isAvailableAsync())throw new Error('File sharing is unavailable on this device.');
  await Sharing.shareAsync(file.uri,{mimeType,dialogTitle:'Save your Orbit backup',UTI:mimeType==='application/json'?'public.json':'public.comma-separated-values-text'});
}
export async function pickBackupText():Promise<string|null>{
  const result=await DocumentPicker.getDocumentAsync({type:['application/json','text/plain'],copyToCacheDirectory:true,multiple:false});
  if(result.canceled)return null;const asset=result.assets[0];if(!asset)throw new Error('No file was selected.');
  if((asset.size??0)>MAX_BACKUP_BYTES)throw new Error('Please choose an Orbit backup smaller than 20 MB.');
  if(Platform.OS==='web'&&asset.file)return asset.file.text();
  return new File(asset.uri).text();
}
