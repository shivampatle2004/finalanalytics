import React, { useEffect, useState } from "react";
import "./LandingPage.css";
import HeroAnimation from "./HeroAnimation";
import logo from "../../assets/logo.png";
import { Link } from "react-router-dom";
import { FEATURES, STEPS, TICKER_ITEMS, CountUp } from "./LandingData";

export default function LandingPage() {
  const [navScrolled, setNavScrolled] = useState(false);
  const [tickerVisible, setTickerVisible] = useState(true);
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const handleScroll = () => { setNavScrolled(window.scrollY > 40); setTickerVisible(window.scrollY < 300); };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => { setActiveStep((prev) => (prev + 1) % STEPS.length); }, 1500);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) { entry.target.classList.add("reveal-in"); entry.target.classList.remove("reveal-out"); }
        else { entry.target.classList.add("reveal-out"); entry.target.classList.remove("reveal-in"); }
      });
    }, { threshold: 0.1 });
    document.querySelectorAll(".reveal-on-scroll").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="v2-container">
      <div className="v2-blobs"><div className="v2-blob v2-blob-1"></div><div className="v2-blob v2-blob-2"></div></div>

      <nav className={`v2-nav ${navScrolled ? "scrolled" : ""}`}>
        <div className="v2-nav-inner">
          <div className="v2-brand"><img src={logo} alt="QueryForge logo" className="v2-logo-img" /></div>
          <div className="v2-nav-links">
            <a href="#features">Features</a><a href="#how">How it works</a><a href="#pricing">Pricing</a>
            <Link to="/login" className="v2-btn-login">Sign In</Link>
            <Link to="/signup" className="v2-btn-cta">Get Started</Link>
          </div>
        </div>
      </nav>

      <div className={`v2-ticker-bar ${!tickerVisible ? 'v2-ticker-hidden' : ''}`}>
        <div className="v2-ticker-track">
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (<span key={i} className="v2-ticker-item">{item}</span>))}
        </div>
      </div>

      <section className="v2-hero split">
        <div className="v2-hero-text reveal-on-scroll">
          <div className="v2-badge pop-in">v2.0 Radiant is Live</div>
          <h1 className="v2-hero-title vibrant-stagger">
            <span className="word">Ship</span> <span className="word">Data</span>
            <span className="word gradient-1">Faster.</span><br />
            <span className="word">Scale</span> <span className="word">Beyond</span>
            <span className="word gradient-2">Limits.</span>
          </h1>
          <p className="v2-hero-sub-left">Next-gen data engine for extreme scale.</p>
          <div className="v2-hero-stats">
            <div className="v2-stat-card color-burgundy"><div className="v2-stat-value">100x</div><div className="v2-stat-label">Query Speed</div></div>
            <div className="v2-stat-card color-purple"><div className="v2-stat-value">Zero</div><div className="v2-stat-label">Copy Storage</div></div>
            <div className="v2-stat-card color-burgundy"><div className="v2-stat-value">ACID</div><div className="v2-stat-label">Compliant</div></div>
          </div>
          <div className="v2-hero-actions">
            <Link to="/workspace"><button className="v2-btn-primary">Launch Workspace</button></Link>
          </div>
        </div>
        <div className="v2-hero-visual reveal-on-scroll"><HeroAnimation /></div>
      </section>

      <section id="features" className="v2-features">
        <div className="v2-features-inner">
          <div className="v2-section-header reveal-on-scroll">
            <div className="v2-masterclass-badge">PRO FEATURES</div>
            <h2>Engineering Masterclass</h2>
          </div>
          <div className="v2-features-grid">
            {FEATURES.map((f, i) => (
              <div key={i} className={`v2-feature-card reveal-on-scroll delay-${i % 3}`}>
                <div className="v2-feature-icon-wrapper" style={{ '--feat-color': f.color }}>{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
                <div className="v2-feature-specs">{f.specs.map((s, si) => <span key={si}>{s}</span>)}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="v2-how horizontal reveal-on-scroll">
        <div className="v2-how-glow"></div>
        <div className="v2-how-inner">
          <div className="v2-section-header">
            <div className="v2-masterclass-badge">PRO PLATFORM</div>
            <h2>Vertical Integration Masterclass</h2>
            <p className="v2-how-sub">An immersive journey through the high-velocity data engine.</p>
          </div>
          <div className="v2-horizontal-steps reveal-on-scroll">
            {STEPS.map((s, i) => (
              <div key={i} className={`v2-step-h ${activeStep === i ? 'active' : ''}`}>
                <div className="v2-step-h-icon">{s.icon}</div>
                <div className="v2-step-h-text"><h3>{s.title}</h3><p>{s.desc}</p></div>
                {i < STEPS.length - 1 && <div className="v2-step-h-line"><div className="v2-flow-energy"></div></div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="v2-cta reveal-on-scroll">
        <div className="v2-cta-inner">
          <h2 className="v2-cta-title">Ready to experience extreme scale?</h2>
          <p className="v2-cta-sub">Join thousands of engineers building the future of data analytics.</p>
          <div className="v2-cta-stats">
            <div className="v2-cta-stat"><div className="v2-cta-stat-number" style={{ color: 'var(--v2-accent)' }}><CountUp end={10} suffix="k+" /></div><div className="v2-cta-stat-label">Active Teams</div></div>
            <div className="v2-cta-stat-divider"></div>
            <div className="v2-cta-stat"><div className="v2-cta-stat-number"><CountUp end={99.99} decimals={2} suffix="%" /></div><div className="v2-cta-stat-label">Uptime SLA</div></div>
            <div className="v2-cta-stat-divider"></div>
            <div className="v2-cta-stat"><div className="v2-cta-stat-number"><CountUp end={1.2} decimals={1} suffix="M+" /></div><div className="v2-cta-stat-label">Rows / Sec</div></div>
            <div className="v2-cta-stat-divider"></div>
            <div className="v2-cta-stat"><div className="v2-cta-stat-number"><CountUp end={84} suffix="k" /></div><div className="v2-cta-stat-label">Queries / Min</div></div>
          </div>
          <Link to="/signup" style={{ textDecoration: 'none' }}><button className="v2-btn-cta">Get Started Now</button></Link>
        </div>
      </section>

      <footer className="v2-footer-new reveal-on-scroll">
        <div className="v2-footer-new-inner">
          <div className="v2-footer-new-top">
            <div className="v2-footer-new-brand-col">
              <div className="v2-brand" style={{ marginBottom: '16px' }}><img src={logo} alt="QueryForge" className="v2-logo-img" style={{ height: '36px' }} /></div>
              <p className="v2-footer-new-tagline">Next-gen data engine for extreme scale analytics.</p>
            </div>
            <div className="v2-footer-new-link-col"><h4>Product</h4><a href="#features">Features</a><a href="#how">How it Works</a><a href="#pricing">Pricing</a></div>
            <div className="v2-footer-new-link-col"><h4>Company</h4><a href="#">About</a><a href="#">Careers</a><a href="#">Blog</a></div>
            <div className="v2-footer-new-link-col"><h4>Account</h4><Link to="/login">Log In</Link><Link to="/signup">Sign Up</Link><a href="#">Support</a></div>
          </div>
          <div className="v2-footer-new-bottom">
            <span>© 2026 QueryForge Inc.</span>
            <span className="v2-footer-new-powered">Powered by Arithwise</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
