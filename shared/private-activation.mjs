// Explicit activation: failed session/registration must not leave reception enabled.
export async function activatePrivateReception({ensureSession,setBackground,registerDevice}){
  if([ensureSession,setBackground,registerDevice].some(fn=>typeof fn!=='function'))throw new Error('Configurazione ricezione non valida');
  try{await ensureSession();await setBackground(true);await registerDevice();}
  catch(error){try{await setBackground(false);}catch{throw new Error('Sospensione della ricezione da verificare');}throw error;}
}
