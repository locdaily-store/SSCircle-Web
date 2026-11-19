// Dedicated Cloudflare Worker. Pages _worker.js cannot receive Cron Triggers.
// Keep SEASON_CRON_TOKEN in Workers/Pages Secrets, never in repository files.
export default {
  async scheduled(_event,env,ctx){
    ctx.waitUntil((async()=>{
      const token=String(env.SEASON_CRON_TOKEN||'');
      const configured=String(env.SSCIRCLE_SITE_URL||'');
      if(token.length<32)throw Error('SEASON_CRON_TOKEN secret is required');
      const origin=new URL(configured);
      if(origin.protocol!=='https:'||origin.username||origin.password||
        origin.pathname!=='/'||origin.search||origin.hash)
        throw Error('SSCIRCLE_SITE_URL must be an HTTPS site origin');
      const response=await fetch(new URL('/api/internal/seasons/tick',origin),{
        method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
        body:'{}',redirect:'error'
      });
      if(!response.ok)throw Error('Season scheduler failed: HTTP '+response.status);
      // Do not print credentials or personal statistics in Cloudflare logs.
      const value=await response.json();
      if(value.started)console.log('Season schedule activated:',value.seasonId);
      if(value.blocked)console.log('Season schedule deferred:',value.blocked);
    })());
  }
};
