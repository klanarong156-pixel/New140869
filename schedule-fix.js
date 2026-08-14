// V6.0 schedule UI safety bridge
(function(){
  'use strict';
  window.removeScheduleSlot=function(index){
    const i=Number(index);
    if(!Number.isInteger(i)||i<0||i>3)return false;
    const enable=document.getElementById(`slotEnable${i}`),on=document.getElementById(`slotOn${i}`),off=document.getElementById(`slotOff${i}`);
    if(enable)enable.checked=false;
    if(on)on.value='00:00';
    if(off)off.value='00:00';
    window.showToast?.(`ล้างช่วงเวลาที่ ${i+1} แล้ว`,'success');
    return true;
  };
})();
