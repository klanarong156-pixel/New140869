/* Smart Farm V6.2 — shared same-origin navigation + shared modern UI */
(function(){
  'use strict';

  function loadModernUI(){
    if(document.querySelector('link[data-modern-ui]')) return;
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href='modern-ui.css?v=1';
    link.dataset.modernUi='1';
    document.head.appendChild(link);
  }

  const currentFile=()=>{
    const path=location.pathname.replace(/\\/g,'/');
    const file=path.split('/').filter(Boolean).pop();
    return (!file || !file.includes('.')) ? 'index.html' : file;
  };

  const normalizeLocalUrl=href=>{
    try{
      const url=new URL(href,location.href);
      if(url.origin!==location.origin)return null;
      if(url.protocol!=='http:' && url.protocol!=='https:')return null;
      return url;
    }catch(_){return null;}
  };

  function markActive(){
    const current=currentFile();
    document.querySelectorAll('.bottom-nav a[href]').forEach(link=>{
      const url=normalizeLocalUrl(link.getAttribute('href')||'');
      const file=url ? (url.pathname.split('/').filter(Boolean).pop()||'index.html') : '';
      link.classList.toggle('active',file===current);
    });
  }

  function navigate(link){
    const href=link.getAttribute('href')||'';
    if(!href || href.startsWith('#') || link.target==='_blank' || link.hasAttribute('download'))return;
    const url=normalizeLocalUrl(href);
    if(!url){
      console.warn('Blocked non-dashboard navigation:',href);
      return;
    }
    if(url.href===location.href)return;
    location.href=url.href;
  }

  document.addEventListener('DOMContentLoaded',()=>{
    loadModernUI();
    markActive();
    document.querySelectorAll('.bottom-nav a[href]').forEach(link=>{
      link.addEventListener('click',event=>{
        if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
        event.preventDefault();
        navigate(link);
      });
    });
  });
})();
