import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOnboarding } from './OnboardingProvider';
import { Sparkles, X, ChevronRight, ChevronLeft, Keyboard, Rocket, Zap, Shield, Activity, Target } from 'lucide-react';
import './TourCard.css';

const ICON_MAP = {
  welcome: <Rocket size={48} color="#8b5cf6" />,
  connectors: <Zap size={48} color="#f59e0b" />,
  warehouse: <Target size={48} color="#ef4444" />,
  analytics: <Activity size={48} color="#10b981" />,
  copilot: <Sparkles size={48} color="#8b5cf6" />
};

export function OnboardingTour() {
  const { isOpen, currentStep, steps, nextStep, prevStep, skipTour } = useOnboarding();
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, height: 0 });
  const [cardPos, setCardPos] = useState({ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' });

  const step = steps[currentStep];

  const updateCoords = useCallback(() => {
    if (!step.target) {
      setCoords({ top: 0, left: 0, width: 0, height: 0 });
      setCardPos({ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' });
      return;
    }

    const el = document.querySelector(step.target);
    if (el) {
      const rect = el.getBoundingClientRect();
      setCoords({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height
      });

      // Calculate card position
      let top = rect.top;
      let left = rect.left;
      let transform = 'none';
      
      const estimatedHeight = 360;
      const cardWidth = 320;

      switch (step.position) {
        case 'bottom':
          top = rect.bottom + 12;
          if (top + estimatedHeight > window.innerHeight - 20) {
             top = rect.top - estimatedHeight - 12;
          }
          left = rect.left + rect.width / 2 - cardWidth / 2;
          break;
        case 'top':
          top = rect.top - estimatedHeight - 12;
          left = rect.left + rect.width / 2 - cardWidth / 2;
          break;
        case 'right':
          top = rect.top + rect.height / 2 - 120;
          left = rect.right + 24;
          break;
        case 'left':
          top = rect.top + rect.height / 2 - 120;
          left = rect.left - 24 - cardWidth;
          break;
        default:
          top = rect.bottom + 12;
          left = rect.left;
      }

      const margin = 20;
      top = Math.max(margin, Math.min(top, window.innerHeight - estimatedHeight - margin));
      left = Math.max(margin, Math.min(left, window.innerWidth - cardWidth - margin));

      setCardPos({ top, left, transform });
    } else {
        setCoords({ top: 0, left: 0, width: 0, height: 0 });
        setCardPos({ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' });
    }
  }, [step]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => {
      if (e.key === 'ArrowRight') nextStep();
      if (e.key === 'ArrowLeft') prevStep();
      if (e.key === 'Escape') skipTour();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, nextStep, prevStep, skipTour]);

  useEffect(() => {
    if (isOpen) {
      // Dispatch navigate if on a route
      if (step.actionPath && !window.location.hash.includes(step.actionPath.replace('/#', ''))) {
        const route = step.actionPath.replace('/#', '');
        window.location.hash = route;
      }

      const timer = setTimeout(updateCoords, 300);
      window.addEventListener('resize', updateCoords);
      window.addEventListener('scroll', updateCoords, true);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('resize', updateCoords);
        window.removeEventListener('scroll', updateCoords, true);
      };
    }
  }, [isOpen, updateCoords, currentStep, step.actionPath]);

  if (!isOpen) return null;

  return (
    <div className="onboarding-overlay" style={{ zIndex: 99999, position: 'fixed', inset: 0 }}>
      <AnimatePresence>
        <motion.div
          key={`backdrop-${currentStep}`}
          className="tour-backdrop-container"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{ position: 'fixed', inset: 0, zIndex: 99997 }}
        >
          <svg style={{ width: '100%', height: '100%', pointerEvents: 'auto' }} onClick={skipTour}>
            <defs>
              <mask id="spotlightMask">
                <rect x="0" y="0" width="100%" height="100%" fill="white" />
                {step.target && coords.width > 0 && (
                  <motion.rect
                    layoutId="tour-spotlight"
                    initial={false}
                    animate={{
                      x: coords.left - 12,
                      y: coords.top - 12,
                      width: coords.width + 24,
                      height: coords.height + 24,
                      rx: 12
                    }}
                    transition={{ type: 'spring', stiffness: 350, damping: 35 }}
                    fill="black"
                  />
                )}
              </mask>
            </defs>
            <rect
              x="0"
              y="0"
              width="100%"
              height="100%"
              fill="rgba(0, 0, 0, 0.45)"
              mask="url(#spotlightMask)"
              style={{ backdropFilter: 'blur(3px)' }}
            />
          </svg>
        </motion.div>
      </AnimatePresence>

      <motion.div
        className="tour-card"
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ 
          opacity: 1, 
          scale: 1, 
          y: 0,
          top: cardPos.top,
          left: cardPos.left,
          transform: cardPos.transform
        }}
        transition={{ type: 'spring', stiffness: 500, damping: 50 }}
        style={{ zIndex: 99999 }}
      >
        <div className="tour-mission-header">
           <div className="mission-progress-segments">
             {steps.map((_, i) => (
               <div key={i} className={`progress-seg ${i <= currentStep ? 'active' : ''} ${i < currentStep ? 'done' : ''}`} />
             ))}
           </div>
        </div>

        <div className="tour-header-row" style={{ cursor: 'move' }}>
          <div className="tour-title-icon">
             {ICON_MAP[step.id] || <Sparkles size={20} color="#8b5cf6" />}
          </div>
          <div className="tour-title-text">
            <span className="mission-tag">Stage {currentStep + 1} of {steps.length}</span>
            <h3 className="tour-title">{step.title}</h3>
          </div>
          <button className="tour-btn-skip" onClick={skipTour} style={{ padding: '4px', opacity: 0.5, cursor: 'pointer', background: 'none', border: 'none', color: 'inherit' }}>
            <X size={16} />
          </button>
        </div>

        <p className="tour-description">{step.description}</p>

        {step.proTip && (
          <div className="tour-pro-tip">
            <div className="tip-content">
              <strong>Tip:</strong> {step.proTip}
            </div>
          </div>
        )}

        <div className="tour-footer">
          <button className="tour-btn tour-btn-skip" onClick={skipTour}>
            Skip Tour
          </button>

          <div className="tour-actions" style={{ display: 'flex', gap: '8px' }}>
            <button className="tour-btn" style={{ background: 'var(--df-border)', color: 'var(--df-text)' }} onClick={prevStep} disabled={currentStep === 0}>
              <ChevronLeft size={16} />
            </button>
            <button className="tour-btn tour-btn-next" onClick={nextStep}>
              {currentStep === steps.length - 1 ? 'Finish' : 'Next'}
              {currentStep < steps.length - 1 && <ChevronRight size={16} />}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
