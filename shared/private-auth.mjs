const uid=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value);
export function createPrivateAuth({apiKey,expectedUid},{load,save,fetchImpl=fetch,clock=()=>Date.now()}={}){
  if(typeof apiKey!=='string'||!/^[A-Za-z0-9_-]{20,128}$/.test(apiKey)||!uid(expectedUid)
    ||typeof load!=='function'||typeof save!=='function')throw new Error('Configurazione autenticazione non valida');
  let session=null,refreshing=null;
  async function request(url,body,form=false){
    const response=await fetchImpl(url,{method:'POST',headers:{'Content-Type':form?'application/x-www-form-urlencoded':'application/json'},
      body:form?new URLSearchParams(body).toString():JSON.stringify(body),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error(`Autenticazione privata HTTP ${response.status}: accesso o rinnovo necessario`);
    const text=await response.text();if(text.length>32768)throw new Error('Risposta autenticazione non valida');
    try{return JSON.parse(text);}catch{throw new Error('Risposta autenticazione non valida');}
  }
  async function accept(data,refresh=false){
    const userId=refresh?data.user_id:data.localId,token=refresh?data.id_token:data.idToken;
    const refreshToken=refresh?data.refresh_token:data.refreshToken,expires=Number(refresh?data.expires_in:data.expiresIn);
    if(userId!==expectedUid||typeof token!=='string'||!token||typeof refreshToken!=='string'||!refreshToken
      ||!Number.isFinite(expires)||expires<120||expires>86400)throw new Error('Identità o sessione privata non valida');
    const next={uid:userId,idToken:token,refreshToken,expiresAt:clock()+expires*1000};await save(next);session=next;return token;
  }
  async function signIn(email,password){
    if(typeof email!=='string'||!email.includes('@')||typeof password!=='string'||!password)throw new Error('Accesso richiesto');
    return accept(await request(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,{email,password,returnSecureToken:true}));
  }
  async function getIdToken(){
    session??=await load();if(!session||session.uid!==expectedUid||typeof session.refreshToken!=='string')throw new Error('Accesso privato necessario');
    if(session.expiresAt>clock()+60000&&session.idToken)return session.idToken;
    refreshing??=(async()=>accept(await request(`https://securetoken.googleapis.com/v1/token?key=${apiKey}`,
      {grant_type:'refresh_token',refresh_token:session.refreshToken},true),true))().finally(()=>{refreshing=null;});
    return refreshing;
  }
  return {signIn,getIdToken,signOut:async()=>{await save(null);session=null;}};
}
