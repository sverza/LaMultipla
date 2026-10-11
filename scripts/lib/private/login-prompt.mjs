import readline from 'node:readline/promises';
import {Writable} from 'node:stream';
export async function promptPrivateLogin(auth){
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
