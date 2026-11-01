const $ = id => document.getElementById(id);
const msg = (text, ok=false) => { $("message").textContent=text; $("message").className="message"+(ok?" success":""); };
$("year").textContent = new Date().getFullYear();

async function loadConfig(){
  try{
    const r=await fetch("/api/public-config"); const d=await r.json();
    $("discordBtn").href=d.discordInvite || "https://discord.gg";
    $("totalUsers").textContent=d.totalUsers===null?"HIDDEN":Number(d.totalUsers).toLocaleString();
    if(!d.keySystemEnabled){$("getKeyBtn").disabled=true;$("getKeyBtn").textContent="KEY SYSTEM DISABLED";}
  }catch{$("totalUsers").textContent="—";}
}
$("getKeyBtn").addEventListener("click",async()=>{
  msg("Generating your key...");
  $("getKeyBtn").disabled=true;
  try{
    const r=await fetch("/api/get-key",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});
    const d=await r.json(); if(!r.ok) throw new Error(d.error||"Could not generate key");
    $("keyInput").value=d.key; msg("Your key is ready. Copy it and keep it safe.",true);
  }catch(e){msg(e.message);}finally{$("getKeyBtn").disabled=false;}
});
$("verifyBtn").addEventListener("click",async()=>{
  const key=$("keyInput").value.trim(); if(!key)return msg("Please enter your key.");
  msg("Checking key...");
  try{
    const r=await fetch("/api/verify-key",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key})});
    const d=await r.json(); if(!r.ok) throw new Error(d.error||"Key check failed");
    msg("KEY VALID — you can now use the script.",true);
  }catch(e){msg(e.message);}
});
loadConfig();
