
export function showToast(msg, type='success', duration=2500){
  const root = document.getElementById('toast-root') || (()=>{const d=document.createElement('div');d.id='toast-root';document.body.appendChild(d);return d})();  
  const t=document.createElement('div');t.className='toast '+type;t.textContent=msg;root.appendChild(t);
  setTimeout(()=>t.remove(),duration);
}
