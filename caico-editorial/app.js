(async()=>{
  'use strict';
  const root='/caico-editorial/';
  const keyText=new URLSearchParams(location.hash.slice(1)).get('k');
  let frame=document.getElementById('content');
  const state=document.getElementById('state');
  const region=document.getElementById('region');
  const header=document.getElementById('header');
  document.querySelector('.skip').addEventListener('click',event=>{event.preventDefault();frame.focus();});
  addEventListener('hashchange',()=>{if(new URLSearchParams(location.hash.slice(1)).get('k')!==keyText)location.reload();});
  let data;
  const decode=text=>Uint8Array.from(atob(text.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-text.length%4)%4)),c=>c.charCodeAt(0));
  const show=(title,message)=>{document.getElementById('state-title').textContent=title;document.getElementById('state-text').textContent=message;};
  if(!keyText||!/^[A-Za-z0-9_-]{43}$/.test(keyText)){
    show('Portal com acesso por link','Abra o endereço completo compartilhado com você para consultar a estratégia.');return;
  }
  function route(){const part=location.pathname.slice(root.length).split('/')[0];return part||'inicio';}
  function urlFor(id,anchor=''){
    return root+(id==='inicio'?'':id+'/')+(anchor?'?trecho='+encodeURIComponent(anchor):'')+'#k='+keyText;
  }
  let noticeTimer;
  function notify(message){const notice=document.getElementById('notice');notice.textContent=message;notice.hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>{notice.hidden=true;},3500);}
  function render(id,anchor=''){
    if(!data.pages[id])id='inicio';
    const nextFrame=frame.cloneNode(false);
    nextFrame.removeAttribute('srcdoc');
    frame.replaceWith(nextFrame);frame=nextFrame;
    frame.title=data.pages[id].title+' | Caico Borelli';
    document.title=data.pages[id].title+' | Redação do Caico';
    for(const a of document.querySelectorAll('[data-page]')){
      a.href=urlFor(a.dataset.page);
      if(a.dataset.page===id)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
    }
    frame.onload=()=>{
      state.hidden=true;header.hidden=false;region.hidden=false;
      frame.contentWindow.postMessage({type:'portal:files',files:data.files},'*');
      if(anchor)frame.contentWindow.postMessage({type:'portal:anchor',anchor},'*');
    };
    frame.srcdoc=data.pages[id].html;
  }
  function navigate(id,anchor=''){
    if(!data.pages[id])return;
    history.pushState({page:id},'',urlFor(id,anchor));render(id,anchor);
  }
  try{
    const response=await fetch(root+'portal.enc',{credentials:'omit',cache:'no-cache',referrerPolicy:'no-referrer'});
    if(!response.ok)throw Error('Conteúdo indisponível');
    const key=await crypto.subtle.importKey('raw',decode(keyText),'AES-GCM',false,['decrypt']);
    const compressed=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(document.querySelector('[name=portal-iv]').content),tagLength:128},key,await response.arrayBuffer());
    const stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
    data=JSON.parse(await new Response(stream).text());
    for(const a of document.querySelectorAll('[data-page]'))a.addEventListener('click',event=>{
      if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
      event.preventDefault();navigate(a.dataset.page);
    });
    addEventListener('popstate',()=>render(route(),new URLSearchParams(location.search).get('trecho')||''));
    addEventListener('message',event=>{
      if(event.source!==frame.contentWindow||!event.data)return;
      if(event.data.type==='portal:navigate')navigate(event.data.page,event.data.anchor||'');
    });
    document.getElementById('share').addEventListener('click',async()=>{
      try{await navigator.clipboard.writeText(new URL(urlFor('inicio'),location.origin).href);notify('Acesso copiado. Compartilhe apenas com a equipe.');}
      catch{notify('Copie o endereço completo na barra do navegador.');}
    });
    render(route(),new URLSearchParams(location.search).get('trecho')||'');
  }catch(error){show('Não foi possível abrir o portal','Confira se o link está completo e tente novamente em um navegador atualizado.');}
})();
