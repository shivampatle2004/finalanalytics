/**
 * StoryPresentation.jsx
 * Full-screen presentation mode for Story Mode.
 * Features: Next/Prev, keyboard nav, progress bar, timer, jump-to, fullscreen.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronLeft, ChevronRight, X, Maximize2, Minimize2,
  Play, Pause, List, SkipForward, SkipBack
} from 'lucide-react';
import './StoryPresentation.css';

const TRANSITIONS = {
  fade: 'sp-trans-fade',
  slide: 'sp-trans-slide',
  zoom: 'sp-trans-zoom',
  none: '',
};

export default function StoryPresentation({ storyId, storyName, points, onClose }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showNav, setShowNav] = useState(true);
  const [showJump, setShowJump] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [animClass, setAnimClass] = useState('');
  const containerRef = useRef(null);
  const navHideTimerRef = useRef(null);
  const playTimerRef = useRef(null);
  const clockRef = useRef(null);

  const currentPoint = points[currentIndex] || null;
  const total = points.length;

  // ── Navigation ──────────────────────────────────────────────────────────────
  const goTo = useCallback((idx, dir = 'next') => {
    if (idx < 0 || idx >= total) return;
    const transClass = TRANSITIONS[currentPoint?.transition || 'fade'];
    setAnimClass(transClass ? `${transClass}-out` : '');
    setTimeout(() => {
      setCurrentIndex(idx);
      setAnimClass(transClass ? `${transClass}-in` : '');
    }, transClass ? 250 : 0);
  }, [currentPoint, total]);

  const goNext = useCallback(() => {
    if (currentIndex < total - 1) goTo(currentIndex + 1, 'next');
    else if (isPlaying) setIsPlaying(false); // Stop at end
  }, [currentIndex, total, goTo, isPlaying]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) goTo(currentIndex - 1, 'prev');
  }, [currentIndex, goTo]);

  // ── Keyboard navigation ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'Space') { e.preventDefault(); goNext(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
      if (e.key === 'Escape') { e.preventDefault(); if (isFullscreen) exitFullscreen(); else onClose(); }
      if (e.key === 'f' || e.key === 'F') toggleFullscreen();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goNext, goPrev, isFullscreen, onClose]);

  // ── Auto-advance timer ──────────────────────────────────────────────────────
  useEffect(() => {
    clearInterval(playTimerRef.current);
    if (!isPlaying || !currentPoint) return;
    const dur = currentPoint.duration || 3000;
    if (dur <= 0) return; // manual-only

    playTimerRef.current = setInterval(() => {
      goNext();
    }, dur);
    return () => clearInterval(playTimerRef.current);
  }, [isPlaying, currentIndex, currentPoint, goNext]);

  // ── Presentation clock ──────────────────────────────────────────────────────
  useEffect(() => {
    clearInterval(clockRef.current);
    clockRef.current = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(clockRef.current);
  }, []);

  // ── Auto-hide nav controls ──────────────────────────────────────────────────
  const resetNavHide = () => {
    setShowNav(true);
    clearTimeout(navHideTimerRef.current);
    if (isFullscreen) {
      navHideTimerRef.current = setTimeout(() => setShowNav(false), 3500);
    }
  };

  useEffect(() => { resetNavHide(); }, [isFullscreen]);

  // ── Fullscreen ──────────────────────────────────────────────────────────────
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const exitFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    setIsFullscreen(false);
  };

  useEffect(() => {
    const handler = () => {
      if (!document.fullscreenElement) setIsFullscreen(false);
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const formatTime = (sec) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  if (!currentPoint) {
    return (
      <div className="sp-root">
        <div className="sp-empty">
          <p>No story points to present.</p>
          <button type="button" onClick={onClose} className="sp-btn">Close</button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`sp-root${isFullscreen ? ' sp-fullscreen' : ''}`}
      onMouseMove={resetNavHide}
      onClick={() => { if (showJump) setShowJump(false); }}
    >
      {/* Progress bar */}
      <div className="sp-progress-bar">
        <div
          className="sp-progress-fill"
          style={{ width: `${((currentIndex + 1) / total) * 100}%` }}
        />
      </div>

      {/* Top bar */}
      <div className={`sp-top-bar${showNav ? '' : ' sp-hidden'}`}>
        <div className="sp-top-left">
          <button type="button" className="sp-ctrl-btn" onClick={onClose} title="Exit presentation (Esc)">
            <X size={16} />
          </button>
          <span className="sp-story-name">{storyName}</span>
        </div>
        <div className="sp-top-center">
          <span className="sp-slide-counter">{currentIndex + 1} / {total}</span>
          <span className="sp-clock">{formatTime(elapsedSec)}</span>
        </div>
        <div className="sp-top-right">
          <button type="button" className="sp-ctrl-btn" onClick={() => setIsPlaying((p) => !p)} title={isPlaying ? 'Pause' : 'Auto-play'}>
            {isPlaying ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <button type="button" className="sp-ctrl-btn" onClick={() => setShowJump((s) => !s)} title="Jump to slide">
            <List size={15} />
          </button>
          <button type="button" className="sp-ctrl-btn" onClick={toggleFullscreen} title="Toggle fullscreen (F)">
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        </div>
      </div>

      {/* Jump-to panel */}
      {showJump && (
        <div className="sp-jump-panel" onClick={(e) => e.stopPropagation()}>
          <div className="sp-jump-header">Jump to…</div>
          <div className="sp-jump-list">
            {points.map((p, i) => (
              <button
                key={p.id}
                type="button"
                className={`sp-jump-item${i === currentIndex ? ' active' : ''}`}
                onClick={() => { goTo(i); setShowJump(false); }}
              >
                <span className="sp-jump-num">{i + 1}</span>
                <span className="sp-jump-title">{p.title || 'Untitled'}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main slide content */}
      <div className={`sp-slide ${animClass}`}>
        <div className="sp-slide-inner">
          {/* Title */}
          <h1 className="sp-slide-title">{currentPoint.title}</h1>

          {/* Snapshot if available */}
          {currentPoint.snapshot_url ? (
            <div className="sp-slide-body sp-slide-body--with-snapshot">
              <div className="sp-snapshot-container">
                <img
                  src={currentPoint.snapshot_url}
                  alt={currentPoint.title}
                  className="sp-snapshot-img"
                />
              </div>
              {currentPoint.narrative && (
                <div className="sp-narrative-aside">
                  <p>{currentPoint.narrative}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="sp-slide-body sp-slide-body--narrative">
              {currentPoint.narrative ? (
                <div className="sp-narrative-full">
                  <p>{currentPoint.narrative}</p>
                </div>
              ) : (
                <div className="sp-slide-no-content">
                  <span>No narrative or snapshot captured for this point.</span>
                </div>
              )}
            </div>
          )}

          {/* Active filters strip */}
          {(currentPoint.filters || []).length > 0 && (
            <div className="sp-filter-strip">
              <span className="sp-filter-label">Filters:</span>
              {currentPoint.filters.slice(0, 5).map((f, i) => (
                <span key={i} className="sp-filter-chip">
                  {f.column} {f.operator || '='} {String(f.value)}
                </span>
              ))}
              {currentPoint.filters.length > 5 && (
                <span className="sp-filter-chip sp-filter-more">+{currentPoint.filters.length - 5} more</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Navigation arrows */}
      <button
        type="button"
        className={`sp-nav-btn sp-nav-prev${showNav ? '' : ' sp-hidden'}${currentIndex === 0 ? ' sp-nav-disabled' : ''}`}
        onClick={goPrev}
        disabled={currentIndex === 0}
        title="Previous (←)"
      >
        <ChevronLeft size={24} />
      </button>

      <button
        type="button"
        className={`sp-nav-btn sp-nav-next${showNav ? '' : ' sp-hidden'}${currentIndex === total - 1 ? ' sp-nav-disabled' : ''}`}
        onClick={goNext}
        disabled={currentIndex === total - 1}
        title="Next (→)"
      >
        <ChevronRight size={24} />
      </button>

      {/* Dot indicators */}
      <div className={`sp-dots${showNav ? '' : ' sp-hidden'}`}>
        {points.map((_, i) => (
          <button
            key={i}
            type="button"
            className={`sp-dot${i === currentIndex ? ' active' : ''}`}
            onClick={() => goTo(i)}
            title={`Go to slide ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
