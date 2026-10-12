import {powershellMemory} from './windows-vault.mjs';
// Constant script: no credentials in shell arguments, interpolation, environment
// or files. Native Windows edit controls accept Ctrl+V, including the masked box.
export const WINDOWS_LOGIN_SCRIPT=String.raw`
Add-Type -AssemblyName System.Windows.Forms;
Add-Type -AssemblyName System.Drawing;
[System.Windows.Forms.Application]::EnableVisualStyles();
$form=[System.Windows.Forms.Form]::new();
$form.Text='LaMultipla - accesso utente PC Firebase';
$form.ClientSize=[System.Drawing.Size]::new(450,230);
$form.FormBorderStyle=[System.Windows.Forms.FormBorderStyle]::FixedDialog;
$form.StartPosition=[System.Windows.Forms.FormStartPosition]::CenterScreen;
$form.MaximizeBox=$false;$form.MinimizeBox=$false;
$emailLabel=[System.Windows.Forms.Label]::new();$emailLabel.Text='Email esatta dell''utente PC in Firebase Authentication';
$emailLabel.Location=[System.Drawing.Point]::new(20,16);$emailLabel.Size=[System.Drawing.Size]::new(410,20);
$email=[System.Windows.Forms.TextBox]::new();$email.Location=[System.Drawing.Point]::new(20,40);$email.Size=[System.Drawing.Size]::new(410,26);
$email.MaxLength=254;$email.ShortcutsEnabled=$true;$email.TabIndex=0;
$passwordLabel=[System.Windows.Forms.Label]::new();$passwordLabel.Text='Password dedicata a questo utente (Ctrl+V per incollare)';
$passwordLabel.Location=[System.Drawing.Point]::new(20,82);$passwordLabel.Size=[System.Drawing.Size]::new(410,20);
$password=[System.Windows.Forms.TextBox]::new();$password.Location=[System.Drawing.Point]::new(20,106);$password.Size=[System.Drawing.Size]::new(410,26);
$password.MaxLength=4096;$password.UseSystemPasswordChar=$true;$password.ShortcutsEnabled=$true;$password.TabIndex=1;
$note=[System.Windows.Forms.Label]::new();$note.Text='La password non viene salvata. Usa le credenziali del PC.';
$note.Location=[System.Drawing.Point]::new(20,144);$note.Size=[System.Drawing.Size]::new(410,20);
$ok=[System.Windows.Forms.Button]::new();$ok.Text='Accedi';$ok.Location=[System.Drawing.Point]::new(230,182);$ok.Size=[System.Drawing.Size]::new(95,28);
$ok.DialogResult=[System.Windows.Forms.DialogResult]::OK;$ok.TabIndex=2;
$cancel=[System.Windows.Forms.Button]::new();$cancel.Text='Annulla';$cancel.Location=[System.Drawing.Point]::new(335,182);$cancel.Size=[System.Drawing.Size]::new(95,28);
$cancel.DialogResult=[System.Windows.Forms.DialogResult]::Cancel;$cancel.TabIndex=3;
$form.Controls.AddRange([System.Windows.Forms.Control[]]@($emailLabel,$email,$passwordLabel,$password,$note,$ok,$cancel));
$form.AcceptButton=$ok;$form.CancelButton=$cancel;
$form.Add_Shown({$email.Select()});
try {
  if($form.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK){
    [Console]::Write((@{email=$email.Text;password=$password.Text}|ConvertTo-Json -Compress));
  }else{[Console]::Write('{"cancelled":true}');}
}finally{$password.Clear();$email.Clear();$form.Dispose();}
`;
export async function readWindowsLogin({run=powershellMemory}={}){
  let result;
  try{const text=await run(WINDOWS_LOGIN_SCRIPT,'',{timeoutMs:300000,sta:true});
    if(typeof text!=='string'||text.length>16384)throw new Error();result=JSON.parse(text);
  }catch{throw new Error('Finestra di accesso Windows non disponibile o scaduta');}
  if(result?.cancelled===true&&Object.keys(result).length===1)throw new Error('Accesso annullato');
  if(!result||Object.keys(result).sort().join(',')!=='email,password'||typeof result.email!=='string'||!result.email.trim().includes('@')
    ||result.email.length>254||typeof result.password!=='string'||!result.password||result.password.length>4096)throw new Error('Compila email e password dell’utente PC Firebase');
  return {email:result.email.trim(),password:result.password};
}
