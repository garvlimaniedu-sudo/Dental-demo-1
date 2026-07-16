import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";

/* ------------------------------------------------------------------
   Design tokens
   Palette: #F7FAF9 (bg) / #0F2E2E (ink) / #2D6E6E (deep teal, CTA)
            #4A9B9B (mid teal, accent) / #DCEEEA (pale mint, panels)
            #C9A15A (warm gold hairline, used sparingly for warmth)
   Type: Fraunces (display) + Inter (body/UI)
------------------------------------------------------------------- */

const FONT_LINK_ID = "dental-site-fonts";

function useGoogleFonts() {
  useEffect(() => {
    if (document.getElementById(FONT_LINK_ID)) return;
    const link = document.createElement("link");
    link.id = FONT_LINK_ID;
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400&family=Inter:wght@400;500;600;700&display=swap";
    document.head.appendChild(link);
  }, []);
}

/* ------------------------------------------------------------------
   3D Tooth — built from primitives (no GLTF dependency), rotating
   slowly, floating, with a soft contact shadow and depth-blurred
   halo discs behind it to fake DOF depth.
------------------------------------------------------------------- */
function ToothScene({ className }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth;
    const height = mount.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
    camera.position.set(0, 0.4, 7);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    // Lighting — soft, clinical-clean but warm key light
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(3, 5, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -4;
    key.shadow.camera.right = 4;
    key.shadow.camera.top = 4;
    key.shadow.camera.bottom = -4;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0x4a9b9b, 0.5);
    fill.position.set(-4, -1, 2);
    scene.add(fill);

    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambient);

    const rim = new THREE.PointLight(0xc9a15a, 0.4, 10);
    rim.position.set(-2, 2, -3);
    scene.add(rim);

    // Tooth geometry: built from lathe (root taper) + rounded crown (sphere, scaled/flattened)
    const toothGroup = new THREE.Group();

    const toothMat = new THREE.MeshPhysicalMaterial({
      color: 0xfbfdfc,
      roughness: 0.28,
      metalness: 0.02,
      clearcoat: 0.6,
      clearcoatRoughness: 0.25,
      sheen: 0.4,
      sheenColor: new THREE.Color(0xdceeea),
    });

    // Crown — flattened, rounded box-ish via sphere scale
    const crownGeo = new THREE.SphereGeometry(1.05, 48, 48);
    crownGeo.scale(1, 0.82, 0.9);
    const crown = new THREE.Mesh(crownGeo, toothMat);
    crown.position.y = 0.55;
    crown.castShadow = true;
    crown.receiveShadow = true;
    toothGroup.add(crown);

    // Root — lathe profile, twin-root taper suggestion via two cones
    const rootMat = toothMat;
    const rootGeoA = new THREE.ConeGeometry(0.34, 1.9, 24);
    const rootA = new THREE.Mesh(rootGeoA, rootMat);
    rootA.position.set(-0.28, -1.35, 0);
    rootA.rotation.z = 0.09;
    rootA.castShadow = true;
    toothGroup.add(rootA);

    const rootGeoB = new THREE.ConeGeometry(0.3, 1.7, 24);
    const rootB = new THREE.Mesh(rootGeoB, rootMat);
    rootB.position.set(0.3, -1.28, 0);
    rootB.rotation.z = -0.11;
    rootB.castShadow = true;
    toothGroup.add(rootB);

    // Subtle groove ring at neck for definition
    const neckGeo = new THREE.TorusGeometry(0.72, 0.035, 16, 48);
    const neckMat = new THREE.MeshStandardMaterial({
      color: 0xdceeea,
      roughness: 0.5,
      transparent: true,
      opacity: 0.55,
    });
    const neck = new THREE.Mesh(neckGeo, neckMat);
    neck.rotation.x = Math.PI / 2;
    neck.position.y = -0.15;
    toothGroup.add(neck);

    toothGroup.scale.setScalar(1.15);
    toothGroup.position.y = 0.2;
    scene.add(toothGroup);

    // Contact shadow (soft blurred ellipse under the tooth)
    const shadowTex = (() => {
      const c = document.createElement("canvas");
      c.width = 256;
      c.height = 256;
      const ctx = c.getContext("2d");
      const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
      g.addColorStop(0, "rgba(15,46,46,0.35)");
      g.addColorStop(1, "rgba(15,46,46,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 256);
      return new THREE.CanvasTexture(c);
    })();
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
    });
    const shadowGeo = new THREE.PlaneGeometry(3.2, 1.8);
    const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -2.05;
    scene.add(shadowPlane);

    // Depth-of-field halo discs behind the tooth (soft blurred circles)
    const haloGroup = new THREE.Group();
    const haloColors = [0x4a9b9b, 0xdceeea, 0xc9a15a];
    for (let i = 0; i < 3; i++) {
      const haloTex = (() => {
        const c = document.createElement("canvas");
        c.width = 256;
        c.height = 256;
        const ctx = c.getContext("2d");
        const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
        const hex = "#" + haloColors[i].toString(16).padStart(6, "0");
        g.addColorStop(0, hex + "55");
        g.addColorStop(1, hex + "00");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 256, 256);
        return new THREE.CanvasTexture(c);
      })();
      const haloMat = new THREE.MeshBasicMaterial({
        map: haloTex,
        transparent: true,
        depthWrite: false,
      });
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), haloMat);
      halo.position.set(
        (i - 1) * 1.6,
        (i % 2 === 0 ? 1 : -1) * 0.8,
        -2.5 - i * 0.8
      );
      haloGroup.add(halo);
    }
    scene.add(haloGroup);

    let raf;
    let t = 0;
    const clock = new THREE.Clock();

    const onResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    const animate = () => {
      const dt = clock.getDelta();
      t += dt;
      toothGroup.rotation.y = Math.sin(t * 0.35) * 0.55 + t * 0.12;
      toothGroup.rotation.z = Math.sin(t * 0.5) * 0.05;
      toothGroup.position.y = 0.2 + Math.sin(t * 0.9) * 0.08;
      haloGroup.children.forEach((h, i) => {
        h.rotation.z += 0.0006 * (i + 1);
      });
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      crownGeo.dispose();
      rootGeoA.dispose();
      rootGeoB.dispose();
      neckGeo.dispose();
      shadowGeo.dispose();
      toothMat.dispose();
      neckMat.dispose();
      shadowMat.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={mountRef} className={className} />;
}

/* ------------------------------------------------------------------
   Small reveal-on-scroll hook
------------------------------------------------------------------- */
function useReveal() {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, visible];
}

function Reveal({ children, delay = 0, className = "" }) {
  const [ref, visible] = useReveal();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(24px)",
        transition: `opacity 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s, transform 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------
   Icon set — minimal line icons, hand-drawn as SVG, consistent stroke
------------------------------------------------------------------- */
const Icon = {
  Shield: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}>
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Spark: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18" strokeLinecap="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  Heart: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}>
      <path d="M12 20s-7-4.5-9.5-9C1 7.5 3 4 6.5 4c2 0 3.5 1.2 4.5 2.8C12 5.2 13.5 4 15.5 4 19 4 21 7.5 20.5 9c-2.5 4.5-8.5 9-8.5 9z" strokeLinejoin="round" />
    </svg>
  ),
  Clock: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Tooth: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}>
      <path d="M12 3c-2 0-3 1-4.5 1S5 3.2 4 4c-1.3 1-1.5 3-1 5 .4 2 1 3.5 1.5 5.5.4 1.6.8 3 1.8 3 1.2 0 1.2-2.5 2-4.2.4-.9.9-1.3 1.7-1.3s1.3.4 1.7 1.3c.8 1.7.8 4.2 2 4.2 1 0 1.4-1.4 1.8-3 .5-2 1.1-3.5 1.5-5.5.5-2 .3-4-1-5-1-.8-2-1-3.5-1S14 3 12 3z" strokeLinejoin="round" />
    </svg>
  ),
  Arrow: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

/* ------------------------------------------------------------------
   Depth-effect image card — layered image + shadow to fake 3D pop
------------------------------------------------------------------- */
function DepthCard({ tone = "mint", title, blurb, glyph: Glyph }) {
  const [hover, setHover] = useState(false);
  const toneMap = {
    mint: { bg: "#DCEEEA", ring: "#4A9B9B" },
    ink: { bg: "#0F2E2E", ring: "#C9A15A" },
    white: { bg: "#FFFFFF", ring: "#2D6E6E" },
  };
  const c = toneMap[tone];
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative",
        borderRadius: 20,
        padding: "36px 30px",
        background: c.bg,
        color: tone === "ink" ? "#F7FAF9" : "#0F2E2E",
        boxShadow: hover
          ? "0 30px 60px -20px rgba(15,46,46,0.28), 0 8px 20px -8px rgba(15,46,46,0.18)"
          : "0 12px 30px -14px rgba(15,46,46,0.16)",
        transform: hover ? "translateY(-6px)" : "translateY(0)",
        transition: "transform 0.45s cubic-bezier(0.16,1,0.3,1), box-shadow 0.45s cubic-bezier(0.16,1,0.3,1)",
        border: tone === "white" ? "1px solid rgba(15,46,46,0.08)" : "none",
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 14,
          display: "grid",
          placeItems: "center",
          background: tone === "ink" ? "rgba(255,255,255,0.08)" : "rgba(15,46,46,0.06)",
          color: c.ring,
          marginBottom: 22,
        }}
      >
        <Glyph style={{ width: 26, height: 26 }} />
      </div>
      <h3
        style={{
          fontFamily: "Fraunces, serif",
          fontWeight: 500,
          fontSize: 21,
          marginBottom: 10,
          letterSpacing: "-0.01em",
        }}
      >
        {title}
      </h3>
      <p style={{ fontFamily: "Inter, sans-serif", fontSize: 15, lineHeight: 1.6, opacity: 0.82 }}>
        {blurb}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------
   Main page
------------------------------------------------------------------- */
export default function DentalSite() {
  useGoogleFonts();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const navLinks = ["Services", "Approach", "Results", "Team", "Visit"];

  return (
    <div
      style={{
        background: "#F7FAF9",
        color: "#0F2E2E",
        minHeight: "100vh",
        fontFamily: "Inter, sans-serif",
        overflowX: "hidden",
      }}
    >
      <style>{`
        * { box-sizing: border-box; }
        html { scroll-behavior: smooth; }
        ::selection { background: #4A9B9B; color: #F7FAF9; }
        a, button { font-family: inherit; }
        .nav-link { position: relative; color: #0F2E2E; text-decoration: none; font-size: 14.5px; font-weight: 500; opacity: 0.75; transition: opacity 0.2s; }
        .nav-link:hover { opacity: 1; }
        .nav-link::after { content: ""; position: absolute; left: 0; bottom: -4px; width: 0; height: 1.5px; background: #2D6E6E; transition: width 0.25s ease; }
        .nav-link:hover::after { width: 100%; }
        .btn-primary { background: #0F2E2E; color: #F7FAF9; border: none; padding: 14px 26px; border-radius: 999px; font-size: 14.5px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; transition: transform 0.3s cubic-bezier(0.16,1,0.3,1), box-shadow 0.3s ease, background 0.3s ease; box-shadow: 0 10px 24px -10px rgba(15,46,46,0.45); }
        .btn-primary:hover { transform: translateY(-2px); background: #2D6E6E; box-shadow: 0 16px 32px -12px rgba(45,110,110,0.5); }
        .btn-ghost { background: transparent; color: #0F2E2E; border: 1.5px solid rgba(15,46,46,0.18); padding: 13px 24px; border-radius: 999px; font-size: 14.5px; font-weight: 600; cursor: pointer; transition: border-color 0.3s ease, background 0.3s ease; }
        .btn-ghost:hover { border-color: #2D6E6E; background: rgba(74,155,155,0.08); }
        .focus-ring:focus-visible { outline: 2px solid #2D6E6E; outline-offset: 3px; }
        @media (prefers-reduced-motion: reduce) {
          * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
        }
        @keyframes floatSlow { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* NAV */}
      <header
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          padding: scrolled ? "14px 6vw" : "22px 6vw",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: scrolled ? "rgba(247,250,249,0.85)" : "transparent",
          backdropFilter: scrolled ? "blur(14px)" : "none",
          borderBottom: scrolled ? "1px solid rgba(15,46,46,0.08)" : "1px solid transparent",
          transition: "all 0.4s cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: "#0F2E2E",
              display: "grid",
              placeItems: "center",
              color: "#DCEEEA",
            }}
          >
            <Icon.Tooth style={{ width: 18, height: 18 }} />
          </div>
          <span style={{ fontFamily: "Fraunces, serif", fontWeight: 600, fontSize: 19, letterSpacing: "-0.01em" }}>
            Meridian Dental
          </span>
        </div>

        <nav style={{ display: "flex", gap: 34 }} className="desktop-nav">
          {navLinks.map((l) => (
            <a key={l} href={`#${l.toLowerCase()}`} className="nav-link">
              {l}
            </a>
          ))}
        </nav>

        <button className="btn-primary focus-ring" style={{ fontSize: 13.5, padding: "11px 20px" }}>
          Book a visit
        </button>
      </header>

      {/* HERO */}
      <section
        style={{
          position: "relative",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          padding: "0 6vw",
          paddingTop: 90,
        }}
      >
        {/* Ambient background washes */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(60% 50% at 78% 30%, rgba(74,155,155,0.14) 0%, rgba(74,155,155,0) 70%), radial-gradient(45% 40% at 15% 80%, rgba(201,161,90,0.10) 0%, rgba(201,161,90,0) 70%)",
            pointerEvents: "none",
          }}
        />

        <div
          style={{
            position: "relative",
            display: "grid",
            gridTemplateColumns: "1.05fr 0.95fr",
            gap: "4vw",
            alignItems: "center",
            width: "100%",
            maxWidth: 1280,
            margin: "0 auto",
          }}
          className="hero-grid"
        >
          <div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 14px",
                borderRadius: 999,
                background: "#DCEEEA",
                color: "#2D6E6E",
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 26,
                animation: "fadeUp 0.8s cubic-bezier(0.16,1,0.3,1) both",
              }}
            >
              <Icon.Shield style={{ width: 14, height: 14 }} />
              Trusted by 12,000+ patients since 2009
            </div>

            <h1
              style={{
                fontFamily: "Fraunces, serif",
                fontWeight: 500,
                fontSize: "clamp(38px, 4.6vw, 62px)",
                lineHeight: 1.06,
                letterSpacing: "-0.02em",
                marginBottom: 22,
                animation: "fadeUp 0.9s cubic-bezier(0.16,1,0.3,1) 0.08s both",
              }}
            >
              Careful dentistry,
              <br />
              <span style={{ fontStyle: "italic", color: "#2D6E6E" }}>
                without the anxiety.
              </span>
            </h1>

            <p
              style={{
                fontSize: 17,
                lineHeight: 1.65,
                color: "rgba(15,46,46,0.72)",
                maxWidth: 460,
                marginBottom: 34,
                animation: "fadeUp 0.9s cubic-bezier(0.16,1,0.3,1) 0.16s both",
              }}
            >
              Meridian combines gentle, modern techniques with clear
              communication at every step — so you always know what's
              happening and why.
            </p>

            <div
              style={{
                display: "flex",
                gap: 14,
                flexWrap: "wrap",
                animation: "fadeUp 0.9s cubic-bezier(0.16,1,0.3,1) 0.24s both",
              }}
            >
              <button className="btn-primary focus-ring">
                Book an appointment
                <Icon.Arrow style={{ width: 15, height: 15 }} />
              </button>
              <button className="btn-ghost focus-ring">See our approach</button>
            </div>

            <div
              style={{
                display: "flex",
                gap: 36,
                marginTop: 52,
                paddingTop: 32,
                borderTop: "1px solid rgba(15,46,46,0.1)",
                maxWidth: 440,
                animation: "fadeUp 0.9s cubic-bezier(0.16,1,0.3,1) 0.32s both",
              }}
            >
              {[
                ["4.9/5", "patient rating"],
                ["15 yrs", "in practice"],
                ["0", "hidden fees"],
              ].map(([num, label]) => (
                <div key={label}>
                  <div style={{ fontFamily: "Fraunces, serif", fontSize: 26, fontWeight: 600 }}>
                    {num}
                  </div>
                  <div style={{ fontSize: 12.5, color: "rgba(15,46,46,0.6)", marginTop: 2 }}>
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 3D tooth hero visual */}
          <div
            style={{
              position: "relative",
              height: "min(560px, 62vh)",
              animation: "floatSlow 6s ease-in-out infinite",
            }}
          >
            <ToothScene className="tooth-canvas" />
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" style={{ padding: "120px 6vw", maxWidth: 1280, margin: "0 auto" }}>
        <Reveal>
          <div style={{ maxWidth: 560, marginBottom: 64 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#4A9B9B", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 14 }}>
              What we treat
            </div>
            <h2 style={{ fontFamily: "Fraunces, serif", fontWeight: 500, fontSize: "clamp(28px, 3vw, 40px)", letterSpacing: "-0.015em", lineHeight: 1.15 }}>
              Every visit has a clear purpose — no upselling, no surprises.
            </h2>
          </div>
        </Reveal>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 24 }}>
          {[
            { glyph: Icon.Tooth, tone: "white", title: "Preventive care", blurb: "Cleanings, sealants, and check-ups built around your actual risk factors, not a fixed schedule." },
            { glyph: Icon.Spark, tone: "mint", title: "Cosmetic dentistry", blurb: "Whitening, veneers, and bonding — planned around how your smile moves, not just how it looks still." },
            { glyph: Icon.Heart, tone: "ink", title: "Gentle root care", blurb: "Root canals and extractions with modern sedation options for patients managing dental anxiety." },
            { glyph: Icon.Clock, tone: "white", title: "Same-week visits", blurb: "Urgent pain or a broken tooth gets seen within days, not weeks — we hold slots for it." },
          ].map((s, i) => (
            <Reveal key={s.title} delay={i * 0.08}>
              <DepthCard {...s} />
            </Reveal>
          ))}
        </div>
      </section>

      {/* APPROACH / TRUST STRIP */}
      <section id="approach" style={{ background: "#0F2E2E", color: "#F7FAF9", padding: "110px 6vw" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60 }} className="approach-grid">
          <Reveal>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#C9A15A", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 14 }}>
                Our approach
              </div>
              <h2 style={{ fontFamily: "Fraunces, serif", fontWeight: 500, fontSize: "clamp(26px, 2.8vw, 36px)", lineHeight: 1.2, marginBottom: 24, letterSpacing: "-0.01em" }}>
                We explain the "why" before we ever pick up a tool.
              </h2>
              <p style={{ fontSize: 16, lineHeight: 1.7, color: "rgba(247,250,249,0.72)", maxWidth: 460 }}>
                Most dental anxiety comes from uncertainty. Before any
                procedure, you'll see your own scans, understand the
                options, and choose the plan that fits your comfort and
                budget — not just ours.
              </p>
            </div>
          </Reveal>

          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            {[
              ["01", "Diagnose", "Digital X-rays and an intraoral camera so you see exactly what we see."],
              ["02", "Discuss", "We walk through every option and its tradeoffs — no single push toward the priciest plan."],
              ["03", "Treat", "Sedation options available for every procedure, from mild to full anxiety support."],
            ].map(([num, title, blurb], i) => (
              <Reveal key={num} delay={i * 0.1}>
                <div style={{ display: "flex", gap: 20, paddingBottom: 24, borderBottom: i < 2 ? "1px solid rgba(247,250,249,0.12)" : "none" }}>
                  <span style={{ fontFamily: "Fraunces, serif", fontSize: 15, color: "#4A9B9B", fontWeight: 600, paddingTop: 2 }}>{num}</span>
                  <div>
                    <div style={{ fontFamily: "Fraunces, serif", fontSize: 19, fontWeight: 500, marginBottom: 6 }}>{title}</div>
                    <div style={{ fontSize: 14.5, color: "rgba(247,250,249,0.65)", lineHeight: 1.6 }}>{blurb}</div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* RESULTS / TESTIMONIALS */}
      <section id="results" style={{ padding: "120px 6vw", maxWidth: 1280, margin: "0 auto" }}>
        <Reveal>
          <div style={{ maxWidth: 560, marginBottom: 56 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#4A9B9B", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 14 }}>
              Patient outcomes
            </div>
            <h2 style={{ fontFamily: "Fraunces, serif", fontWeight: 500, fontSize: "clamp(28px, 3vw, 40px)", letterSpacing: "-0.015em", lineHeight: 1.15 }}>
              What changes after the first few visits.
            </h2>
          </div>
        </Reveal>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24 }}>
          {[
            { quote: "I hadn't seen a dentist in six years out of pure anxiety. They walked me through everything before touching anything.", name: "R. Mehta", role: "Patient since 2023" },
            { quote: "My daughter's sealants took fifteen minutes and she asked when we could come back. That says everything.", name: "S. Okafor", role: "Parent, patient since 2021" },
            { quote: "Clear pricing before treatment started, and it matched the final bill exactly. Rare in this industry.", name: "T. Lindqvist", role: "Patient since 2019" },
          ].map((t, i) => (
            <Reveal key={t.name} delay={i * 0.08}>
              <div
                style={{
                  background: "#FFFFFF",
                  border: "1px solid rgba(15,46,46,0.08)",
                  borderRadius: 20,
                  padding: 30,
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  boxShadow: "0 14px 34px -18px rgba(15,46,46,0.18)",
                }}
              >
                <div style={{ color: "#C9A15A", fontSize: 20, marginBottom: 14, letterSpacing: 2 }}>★★★★★</div>
                <p style={{ fontSize: 15, lineHeight: 1.65, color: "rgba(15,46,46,0.82)", marginBottom: 24, flexGrow: 1 }}>
                  "{t.quote}"
                </p>
                <div>
                  <div style={{ fontFamily: "Fraunces, serif", fontWeight: 600, fontSize: 15 }}>{t.name}</div>
                  <div style={{ fontSize: 13, color: "rgba(15,46,46,0.55)" }}>{t.role}</div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section id="visit" style={{ padding: "0 6vw 120px" }}>
        <Reveal>
          <div
            style={{
              maxWidth: 1280,
              margin: "0 auto",
              background: "linear-gradient(135deg, #103535 0%, #0F2E2E 60%, #163f3f 100%)",
              borderRadius: 32,
              padding: "72px 6vw",
              textAlign: "center",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "radial-gradient(50% 60% at 50% 0%, rgba(74,155,155,0.25) 0%, rgba(74,155,155,0) 70%)",
                pointerEvents: "none",
              }}
            />
            <h2
              style={{
                fontFamily: "Fraunces, serif",
                fontWeight: 500,
                fontSize: "clamp(28px, 3.4vw, 42px)",
                color: "#F7FAF9",
                marginBottom: 18,
                letterSpacing: "-0.015em",
                position: "relative",
              }}
            >
              Your next visit can start differently.
            </h2>
            <p style={{ color: "rgba(247,250,249,0.7)", fontSize: 16, marginBottom: 36, position: "relative" }}>
              Consultations are 30 minutes, unhurried, and cost nothing.
            </p>
            <button
              className="focus-ring"
              style={{
                background: "#F7FAF9",
                color: "#0F2E2E",
                border: "none",
                padding: "15px 32px",
                borderRadius: 999,
                fontSize: 15,
                fontWeight: 600,
                cursor: "pointer",
                position: "relative",
                boxShadow: "0 16px 34px -12px rgba(0,0,0,0.4)",
              }}
            >
              Book your free consultation
            </button>
          </div>
        </Reveal>
      </section>

      {/* FOOTER */}
      <footer style={{ borderTop: "1px solid rgba(15,46,46,0.1)", padding: "56px 6vw 40px" }}>
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "1.4fr 1fr 1fr 1fr",
            gap: 40,
          }}
          className="footer-grid"
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: "#0F2E2E", display: "grid", placeItems: "center", color: "#DCEEEA" }}>
                <Icon.Tooth style={{ width: 15, height: 15 }} />
              </div>
              <span style={{ fontFamily: "Fraunces, serif", fontWeight: 600, fontSize: 16 }}>Meridian Dental</span>
            </div>
            <p style={{ fontSize: 13.5, color: "rgba(15,46,46,0.6)", lineHeight: 1.6, maxWidth: 260 }}>
              Modern dental care, delivered with patience — for patients who've had reason not to trust it before.
            </p>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Visit</div>
            <div style={{ fontSize: 13.5, color: "rgba(15,46,46,0.65)", lineHeight: 2.1 }}>
              214 Larkspur Ave<br />Suite 3, Ashford<br />Mon–Sat, 8am–6pm
            </div>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Practice</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13.5, color: "rgba(15,46,46,0.65)" }}>
              <a href="#services" style={{ color: "inherit", textDecoration: "none" }}>Services</a>
              <a href="#approach" style={{ color: "inherit", textDecoration: "none" }}>Our approach</a>
              <a href="#results" style={{ color: "inherit", textDecoration: "none" }}>Patient stories</a>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Legal</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13.5, color: "rgba(15,46,46,0.65)" }}>
              <span>Privacy policy</span>
              <span>Patient rights</span>
              <span>Accessibility</span>
            </div>
          </div>
        </div>
        <div style={{ maxWidth: 1280, margin: "48px auto 0", paddingTop: 24, borderTop: "1px solid rgba(15,46,46,0.08)", fontSize: 12.5, color: "rgba(15,46,46,0.5)" }}>
          © 2026 Meridian Dental. All rights reserved.
        </div>
      </footer>

      <style>{`
        @media (max-width: 880px) {
          .desktop-nav { display: none; }
          .hero-grid { grid-template-columns: 1fr !important; }
          .approach-grid { grid-template-columns: 1fr !important; }
          .footer-grid { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>
    </div>
  );
}
