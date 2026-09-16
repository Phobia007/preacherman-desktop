// Keep the donor's lower options and their handlers without mounting its intro,
// bracelet scene, logo, step navigation, preloader or asset-loading cascade.
const component = `function PreachermanMarketFooter(){const preloader=K.useRef({preloadStep:async()=>true});K.useEffect(()=>{pn.setState({result:null,currentStep:"model",currentSelection:{model:"classic"}});document.dispatchEvent(new CustomEvent(ed.ready))},[]);return G.jsx(Dee,{preloader})}`;
const original = 'function hie({supportsAvif:n}){';
const patched = component + original + 'if(XO.dataset.marketFooter==="true")return G.jsx(PreachermanMarketFooter,{});';
export function patchMarketDetailsFooter(bundle) {
  if (bundle.includes(patched)) return bundle;
  if (bundle.split(original).length !== 2) throw new Error("Market configurator entry changed");
  return bundle.replace(original, patched);
}
export function unpatchMarketDetailsFooter(bundle) { return bundle.replace(patched, original); }
