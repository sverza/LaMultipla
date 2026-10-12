import readline from 'node:readline/promises';
import {Writable} from 'node:stream';
import {readWindowsLogin} from './windows-login.mjs';
export async function promptPrivateLogin(auth,{platform=process.platform,windowsPrompt=readWindowsLogin,announce=message=>process.stdout.write(message+'\n')}={}){
  if(platform==='win32'){
    announce('Si apre la finestra di accesso PC. Email e password si possono incollare con Ctrl+V.');
    const credentials=await windowsPrompt();
    try{await auth.signIn(credentials.email,credentials.password);return {authenticated:true,passwordStored:false};}
    finally{credentials.password='';credentials.email='';}
  }
  if(!process.stdin.isTTY)throw new Error('Accesso richiesto in un terminale interattivo; credenziali mai negli argomenti');
  let hidden=false;
  const output=new Writable({write(chunk,encoding,done){if(!hidden)process.stdout.write(chunk,encoding);done();}});
  const rl=readline.createInterface({input:process.stdin,output,terminal:true});
  try{const email=await rl.question('Email dell’identità PC privata: ');
    process.stdout.write('Password (non visualizzata): ');hidden=true;
    const password=await rl.question('');hidden=false;process.stdout.write('\n');
    await auth.signIn(email.trim(),password);return {authenticated:true,passwordStored:false};
  }finally{rl.close();output.end();}
}
