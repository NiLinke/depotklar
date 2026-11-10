const menu=document.querySelector('.menu-toggle'),navigation=document.querySelector('#site-nav');
function closeMenu(){menu?.setAttribute('aria-expanded','false');menu?.setAttribute('aria-label','Menü öffnen');navigation?.classList.remove('is-open');}
menu?.addEventListener('click',()=>{const expanded=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(expanded));menu.setAttribute('aria-label',expanded?'Menü schließen':'Menü öffnen');navigation.classList.toggle('is-open',expanded);});
navigation?.addEventListener('click',event=>{if(event.target.closest('a'))closeMenu();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){const expanded=menu?.getAttribute('aria-expanded')==='true';closeMenu();if(expanded)menu.focus();}});
const tabs=[...document.querySelectorAll('[data-tab]')];
function selectTab(tab){for(const candidate of tabs){const selected=candidate===tab;candidate.setAttribute('aria-selected',String(selected));candidate.tabIndex=selected?0:-1;document.getElementById(candidate.getAttribute('aria-controls')).hidden=!selected;}}
for(const [index,tab] of tabs.entries()){
 tab.addEventListener('click',()=>selectTab(tab));
 tab.addEventListener('keydown',event=>{let target;if(['ArrowDown','ArrowRight'].includes(event.key))target=tabs[(index+1)%tabs.length];else if(['ArrowUp','ArrowLeft'].includes(event.key))target=tabs[(index+tabs.length-1)%tabs.length];else if(event.key==='Home')target=tabs[0];else if(event.key==='End')target=tabs.at(-1);if(target){event.preventDefault();selectTab(target);target.focus();}});
}
