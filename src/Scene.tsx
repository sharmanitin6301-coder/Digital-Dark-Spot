import { KiboriLandingPage } from "./shaders/kibori-landing-page/KiboriLandingPage";

export function Scene() {
  return (
    <div className="shader-frame" style={{ width: "100vw", height: "100vh" }}>
      <KiboriLandingPage style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
