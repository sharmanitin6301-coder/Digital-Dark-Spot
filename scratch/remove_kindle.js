const fs = require('fs');

const originalHtml = fs.readFileSync('public/index.html', 'utf8');

// 1. Remove the worker preboot script in <head>
const prebootPattern = /<script>\s*\/\* The loader \(#kindle\) draws its fire in a worker[\s\S]*?<\/script>/;
if (!prebootPattern.test(originalHtml)) {
  console.error("Could not find preboot script in <head>");
  process.exit(1);
}
let updated = originalHtml.replace(prebootPattern, `<script>
/* WebGL availability check & graceful fallback initialization */
window.__kbCheckWebGL = function() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl')));
  } catch (e) {
    return false;
  }
};
</script>`);

// 2. In <style>, ensure #kindle is hidden permanently
const kindleStylePattern = /#kindle\{position:fixed;inset:0;z-index:8;background:#000;pointer-events:none;\s*transition:opacity \.16s linear\}/;
if (!kindleStylePattern.test(updated)) {
  console.error("Could not find #kindle CSS rule");
  process.exit(1);
}
updated = updated.replace(kindleStylePattern, `#kindle{display:none!important;position:fixed;inset:0;z-index:8;background:#000;pointer-events:none}`);

// 3. Extract the exact GLSL string for window.__kbEdge
const edgeMatch = originalHtml.match(/const EDGE = window\.__kbEdge = `([\s\S]*?)`;/);
if (!edgeMatch) {
  console.error("Could not find window.__kbEdge in index.html");
  process.exit(1);
}
const edgeShaderGlsl = edgeMatch[1];
console.log("Successfully extracted window.__kbEdge GLSL shader, length:", edgeShaderGlsl.length);

// 4. Replace the entire Kindle HTML (<div id="kindle">...</div>) and the 1000+ line Kindle worker script
const kindleHtmlAndScriptPattern = /<!-- Kindling: the loader is the first stretch of the intro burn[\s\S]*?<div id="kindle">[\s\S]*?<\/div>\s*<script>[\s\S]*?<\/script>\s*<div id="track"><\/div>/;
if (!kindleHtmlAndScriptPattern.test(updated)) {
  console.error("Could not find Kindle HTML and script block");
  process.exit(1);
}

const cleanLoaderScript = `<!-- Digital Dark Spot Direct 3D Entry (Kindling loader removed) -->
<script>
(() => {
  /* Retain introBurn easing curve for transitions */
  const HAND = 0.36, DUR = 2.30, V_HAND = 0.24, RH = 1 - Math.pow(1 - HAND, 1/1.70);
  const introBurn = window.__kbIntroBurn = x => {
    if (x <= RH) return 1 - Math.pow(1 - x, 1.70);
    const u = Math.min(1, (x - RH)/(1 - RH)), s0 = V_HAND*DUR*(1 - RH)/(1 - HAND);
    return HAND + (1 - HAND)*(s0*u*(1 - u)*(1 - u) + u*u*(3 - 2*u));
  };

  /* The burning edge GLSL shader (shared with compMat and Station 04 Yakisugi) */
  const EDGE = window.__kbEdge = \`${edgeShaderGlsl}\`;

  /* Immediate non-blocking loader controller */
  window.__kbLoad = {
    t0: performance.now(),
    handAt: performance.now(),
    velocity: () => 0.65,
    ready: () => Promise.resolve(),
    set: () => {},
    follow: () => {},
    step: () => Promise.resolve(),
    done: () => Promise.resolve(),
    close: () => {
      const k = document.getElementById('kindle');
      if (k) k.remove();
    }
  };

  /* Graceful WebGL fallback */
  window.showWebGLFallback = function(err) {
    console.warn('WebGL fallback activated:', err);
    const k = document.getElementById('kindle');
    if (k) k.remove();
    const stage = document.getElementById('stage');
    if (stage) stage.style.background = 'radial-gradient(ellipse at 50% 30%, #1c150e 0%, #0a0806 80%)';
    const bar = document.getElementById('bar');
    if (bar) { bar.style.opacity = '1'; bar.style.visibility = 'visible'; bar.style.pointerEvents = 'auto'; }
    const lockup = document.getElementById('lockup');
    if (lockup) {
      lockup.style.opacity = '1'; lockup.style.visibility = 'visible'; lockup.style.pointerEvents = 'auto';
      lockup.querySelectorAll('.lk-word, .lk-v, .lk-seal, .lk-line, .lk-actions').forEach(el => {
        el.style.opacity = '1'; el.style.visibility = 'visible';
      });
    }
    const foot = document.getElementById('foot');
    if (foot) {
      foot.classList.add('up');
      foot.style.position = 'relative';
      foot.style.transform = 'none';
      foot.style.pointerEvents = 'auto';
    }
    const track = document.getElementById('track');
    if (track) track.style.display = 'none';
    if (!document.getElementById('webgl-fallback-notice')) {
      const n = document.createElement('div');
      n.id = 'webgl-fallback-notice';
      n.textContent = 'Hardware 3D acceleration is not active — Direct 2D Verification View';
      n.setAttribute('style', 'position:fixed;bottom:12px;left:50%;transform:translateX(-50%);z-index:99;background:rgba(27,19,12,.92);border:1px solid rgba(224,189,128,.3);color:rgba(242,236,226,.8);padding:6px 14px;border-radius:4px;font-family:sans-serif;font-size:11px;letter-spacing:.08em;pointer-events:none;');
      document.body.appendChild(n);
    }
  };
})();
</script>
<div id="track"></div>`;

updated = updated.replace(kindleHtmlAndScriptPattern, cleanLoaderScript);

// 5. Wrap WebGLRenderer instantiation in try/catch to catch unsupported WebGL gracefully
const rendererInitPattern = /const canvas = document\.getElementById\('gl'\);\s*const renderer = new THREE\.WebGLRenderer\(\{canvas, antialias:false, alpha:false,\s*powerPreference:'high-performance'\}\);/;
if (!rendererInitPattern.test(updated)) {
  console.error("Could not find renderer instantiation");
  process.exit(1);
}
updated = updated.replace(rendererInitPattern, `const canvas = document.getElementById('gl');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({canvas, antialias:false, alpha:false,
    powerPreference:'high-performance'});
} catch (err) {
  if (window.showWebGLFallback) window.showWebGLFallback(err);
  throw err;
}`);

// 6. Update the boot section to immediately reveal the workshop and lockup at full illumination
const bootPattern = /try \{ await prepareWorkshop\(\); \} catch \(e\) \{ console\.warn\('Workshop warm-up:', e\); \}\s*last = performance\.now\(\);\s*S\.warm = 2;\s*frame\(performance\.now\(\)\);\s*LOAD\.done\(\)\.then\(\(\) => \{[\s\S]*?setTimeout\(\(\) => \{ if \(S\.closeIn !== undefined\)\{ S\.closeIn = undefined; S\.fadeEnd = performance\.now\(\) \+ 260; LOAD\.close\(\); \} \}, 700\);\s*\}\);/;
if (!bootPattern.test(updated)) {
  console.error("Could not find boot sequence");
  process.exit(1);
}

const directBootSequence = `try { await prepareWorkshop(); } catch (e) { console.warn('Workshop warm-up:', e); }
last = performance.now();
S.warm = 2;
/* Direct reveal: initialize intro clock past completion so scene renders directly at full illumination */
S.handT = performance.now();
S.i0 = S.handT - (INTRO.start + 3.0 * INTRO.dur) * 1000;
S.reveal = 1.0;
LOAD.close();
frame(performance.now());
LOAD.done().then(() => {
  S.closeIn = undefined;
  S.fadeEnd = 0;
  LOAD.close();
});`;

updated = updated.replace(bootPattern, directBootSequence);

fs.writeFileSync('public/index.html', updated, 'utf8');
console.log("Successfully updated public/index.html! New length:", updated.length);
