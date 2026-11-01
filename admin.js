const $=id=>document.getElementById(id); let token=localStorage.getItem("sultaniqz_admin_token");
const options=[["keySystemEnabled","Key system"],["autoGenerateEnabled","Automatic key generation"],["discordEnabled","Discord notifications"],["usageCountEnabled","Unique user counter"]];
function auth(){return {Authorization:"Bearer "+token,"Content-Type":"application/json"}}
function say(t,ok=false){$("adminMsg").textContent=t;$("adminMsg").className="message"+(ok?" success":"")}
async function api(url,opts={}){const r=await fetch(url,{...opts,headers:{...auth(),...(opts.headers||{})}});const d=await r.json();if(!r.ok)throw new Error(d.error||"Request failed");return d}
$("loginBtn").onclick=async()=>{try{const r=await fetch("/api/admin/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:$("password").value})});const d=await r.json();if(!r.ok)throw new Error(d.error);token=d.token;localStorage.setItem("sultaniqz_admin_token",token);await show();}catch(e){$("loginMsg").textContent=e.message}};
async function show(){
  $("loginPanel").classList.add("hidden");$("dashboard").classList.remove("hidden");
  const d=await api("/api/admin/data"); const s=d.settings;
  $("toggles").innerHTML=options.map(([k,label])=>`<label class="toggle"><span>${label}</span><input type="checkbox" data-setting="${k}" ${s[k]?"checked":""}><b></b></label>`).join("");
  $("duration").value=s.keyDurationHours;$("invite").value=s.discordInvite;$("total").value=s.totalUsers;
  $("keys").innerHTML=d.keys.length?d.keys.map(k=>`<div class="record"><code>${k.key}</code><small>${new Date(k.expiresAt).toLocaleString()} · ${k.used?"USED":"UNUSED"}</small><button data-delete="${encodeURIComponent(k.key)}">DELETE</button></div>`).join(""):"<p class='muted'>No keys yet.</p>";
  $("logs").innerHTML=d.logs.length?d.logs.slice(0,20).map(l=>`<div class="record"><b>${l.type}</b><small>${l.description} · ${new Date(l.at).toLocaleString()}</small></div>`).join(""):"<p class='muted'>No activity yet.</p>";
  document.querySelectorAll("[data-delete]").forEach(b=>b.onclick=async()=>{if(!confirm("Delete this key?"))return;await api("/api/admin/keys/"+b.dataset.delete,{method:"DELETE"});await show();});
}
$("saveBtn").onclick=async()=>{try{const body={keyDurationHours:Number($("duration").value),discordInvite:$("invite").value,totalUsers:Number($("total").value)};document.querySelectorAll("[data-setting]").forEach(x=>body[x.dataset.setting]=x.checked);await api("/api/admin/settings",{method:"PATCH",body:JSON.stringify(body)});say("Settings saved.",true);}catch(e){say(e.message)}};
$("testBtn").onclick=async()=>{try{await api("/api/admin/discord-test",{method:"POST",body:"{}"});say("Discord test sent.",true)}catch(e){say(e.message)}};
$("newKeyBtn").onclick=async()=>{try{const d=await api("/api/admin/keys",{method:"POST",body:JSON.stringify({})});$("newKeyResult").textContent="New key: "+d.key;await show();}catch(e){say(e.message)}};
$("logoutBtn").onclick=()=>{localStorage.removeItem("sultaniqz_admin_token");token=null;location.reload()};
if(token){show().catch(()=>{localStorage.removeItem("sultaniqz_admin_token");token=null;});}
