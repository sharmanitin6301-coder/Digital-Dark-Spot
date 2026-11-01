/**
 * DIGITAL DARK SPOT — FRONTEND CONTROLLER (STEP 3)
 * Handles state management, dynamic source list, progressive loading states,
 * real backend API calls, Washi paper dossier results rendering, interactive
 * evidence drawer with highlighted quotes, and verification checklist tools.
 */

(function () {
  'use strict';

  // =========================================================================
  // APPLICATION STATE
  // =========================================================================
  const state = {
    // Current sources configured in Screen 1 (2 to 5 sources)
    sources: [
      { id: 'S1', type: 'url', url: '', text: '', title: '' },
      { id: 'S2', type: 'url', url: '', text: '', title: '' }
    ],
    // Preserved question string
    question: '',
    // Fetched/extracted source records ready for analysis
    fetchedSources: [],
    // Result payload returned from POST /api/analyze
    analysis: null,
    // Set of checked checklist indices
    checkedItems: new Set(),
    // Timer ID for progressive loading messages
    loadingTimer: null,
    // Active sample demo mode
    isSampleDemo: false
  };

  // Sample prompt definitions for instant exploration
  const SAMPLE_PROMPTS = {
    scholarship: {
      question: 'What should I verify about eligibility criteria, renewal conditions, and repayment obligations before applying for scholarships and aid?',
      sources: [
        { id: 'S1', type: 'url', url: 'https://en.wikipedia.org/wiki/Scholarship', text: '', title: '' },
        { id: 'S2', type: 'url', url: 'https://en.wikipedia.org/wiki/Student_financial_aid_in_the_United_States', text: '', title: '' }
      ]
    },
    syndication: {
      question: 'What hidden risks, fee structures, and capital call liabilities should passive investors examine before investing in real estate syndications?',
      sources: [
        { id: 'S1', type: 'url', url: 'https://en.wikipedia.org/wiki/Real_estate_investment_trust', text: '', title: '' },
        { id: 'S2', type: 'url', url: 'https://en.wikipedia.org/wiki/Private_equity_real_estate', text: '', title: '' }
      ]
    },
    fasting: {
      question: 'What medical contraindications, electrolyte depletion risks, and medication interactions should be evaluated before beginning an extended intermittent fasting protocol?',
      sources: [
        { id: 'S1', type: 'url', url: 'https://en.wikipedia.org/wiki/Intermittent_fasting', text: '', title: '' },
        { id: 'S2', type: 'url', url: 'https://en.wikipedia.org/wiki/Autophagy', text: '', title: '' }
      ]
    }
  };

  // =========================================================================
  // DOM ELEMENT REFERENCES
  // =========================================================================
  const elements = {
    // Views
    inputSection: document.getElementById('input-section'),
    loadingSection: document.getElementById('loading-section'),
    resultsSection: document.getElementById('results-section'),

    // Form inputs
    form: document.getElementById('analysis-form'),
    questionInput: document.getElementById('research-question'),
    questionError: document.getElementById('question-error'),
    sourcesList: document.getElementById('sources-list'),
    sourceCountBadge: document.getElementById('source-count-badge'),
    addSourceBtn: document.getElementById('add-source-btn'),
    submitBtn: document.getElementById('submit-btn'),
    sampleDemoBtn: document.getElementById('sample-demo-btn'),
    sampleDemoNoticeBanner: document.getElementById('sample-demo-notice-banner'),
    errorBanner: document.getElementById('form-error-banner'),
    sampleChips: document.querySelectorAll('.sample-chip'),

    // Loading screen
    loadingTitle: document.getElementById('loading-title'),
    loadingMessage: document.getElementById('loading-message'),
    stepDots: document.querySelectorAll('.loading-steps-indicator .step-dot'),

    // Results Dashboard (Washi sheet)
    backToInputBtn: document.getElementById('back-to-input-btn'),
    dossierModelTag: document.getElementById('dossier-model-tag'),
    dossierQuestion: document.getElementById('dossier-question'),
    confidenceBadge: document.getElementById('confidence-badge'),
    confidenceNote: document.getElementById('confidence-note'),
    auditVerifiedCount: document.getElementById('audit-verified-count'),
    auditTotalCount: document.getElementById('audit-total-count'),

    // Result Containers
    summaryContainer: document.getElementById('summary-container'),
    gapsContainer: document.getElementById('gaps-container'),
    conflictsContainer: document.getElementById('conflicts-container'),
    outdatedContainer: document.getElementById('outdated-container'),
    unansweredContainer: document.getElementById('unanswered-container'),
    checklistContainer: document.getElementById('checklist-container'),
    sourcesManifestContainer: document.getElementById('sources-manifest-container'),

    // Checklist action tools
    checklistProgressPill: document.getElementById('checklist-progress-pill'),
    checklistProgressBar: document.getElementById('checklist-progress-bar'),
    copyChecklistBtn: document.getElementById('copy-checklist-btn'),
    downloadChecklistBtn: document.getElementById('download-checklist-btn'),

    // Source Evidence Drawer
    drawer: document.getElementById('evidence-drawer'),
    drawerBackdrop: document.getElementById('drawer-backdrop'),
    drawerCloseBtn: document.getElementById('drawer-close-btn'),
    drawerBadge: document.getElementById('drawer-source-badge'),
    drawerTitle: document.getElementById('drawer-source-title'),
    drawerUrl: document.getElementById('drawer-source-url'),
    drawerDate: document.getElementById('drawer-source-date'),
    drawerStatus: document.getElementById('drawer-source-status'),
    drawerQuoteBox: document.getElementById('drawer-quote-highlight-box'),
    drawerVerificationBadge: document.getElementById('drawer-verification-badge'),
    drawerQuoteText: document.getElementById('drawer-quote-text'),
    drawerSourceText: document.getElementById('drawer-source-text')
  };

  // =========================================================================
  // UTILITY FUNCTIONS
  // =========================================================================

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  let toastElement = null;
  function showToast(message) {
    if (!toastElement) {
      toastElement = document.createElement('div');
      toastElement.className = 'app-toast';
      document.body.appendChild(toastElement);
    }
    toastElement.textContent = message;
    toastElement.classList.add('visible');
    setTimeout(() => {
      toastElement.classList.remove('visible');
    }, 3500);
  }

  function showError(msg) {
    if (!elements.errorBanner) return;
    elements.errorBanner.textContent = msg;
    elements.errorBanner.hidden = false;
    elements.errorBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function clearError() {
    if (!elements.errorBanner) return;
    elements.errorBanner.textContent = '';
    elements.errorBanner.hidden = true;
  }

  function clearErrors() {
    clearError();
    if (elements.questionError) {
      elements.questionError.textContent = '';
      elements.questionError.hidden = true;
    }
    if (elements.questionInput) {
      elements.questionInput.classList.remove('input-has-error');
    }
    state.sources.forEach((s, idx) => {
      delete s.hasError;
      delete s.errorMessage;
      const errEl = document.getElementById(`source-error-${idx}`);
      if (errEl) {
        errEl.textContent = '';
        errEl.hidden = true;
      }
      const card = elements.sourcesList ? elements.sourcesList.querySelector(`[data-index="${idx}"]`) : null;
      if (card) {
        card.querySelectorAll('.source-input-field, .pasted-text-area').forEach((inp) => inp.classList.remove('input-has-error'));
      }
    });
  }

  function setQuestionError(msg) {
    if (elements.questionError) {
      elements.questionError.textContent = msg;
      elements.questionError.hidden = false;
    }
    if (elements.questionInput) {
      elements.questionInput.classList.add('input-has-error');
    }
  }

  function setSourceError(idx, msg) {
    if (state.sources[idx]) {
      state.sources[idx].hasError = true;
      state.sources[idx].errorMessage = msg;
    }
    const errEl = document.getElementById(`source-error-${idx}`);
    if (errEl) {
      errEl.textContent = msg;
      errEl.hidden = false;
    }
    const card = elements.sourcesList ? elements.sourcesList.querySelector(`[data-index="${idx}"]`) : null;
    if (card) {
      const fieldInput = card.querySelector('.source-input-field');
      if (fieldInput) fieldInput.classList.add('input-has-error');
      const textArea = card.querySelector('.pasted-text-area');
      if (textArea) textArea.classList.add('input-has-error');
    }
  }

  // =========================================================================
  // SCREEN 1: SOURCES RENDERING & FORM INTERACTIONS
  // =========================================================================

  function renderSources() {
    elements.sourcesList.innerHTML = '';

    state.sources.forEach((src, idx) => {
      const card = document.createElement('div');
      card.className = 'source-item-card';
      card.dataset.index = idx;

      const isUrlMode = src.type === 'url';
      const canRemove = state.sources.length > 2;

      let statusBadgeHtml = '';
      if (src.fetchStatus === 'success') {
        statusBadgeHtml = `<span class="source-status-badge success">✓ Available</span>`;
      } else if (src.fetchStatus === 'failed' || src.fetchStatus === 'error') {
        statusBadgeHtml = `<span class="source-status-badge failed">✕ Inaccessible</span>`;
      }

      card.innerHTML = `
        <div class="source-item-top">
          <div style="display: flex; align-items: center; gap: 0.6rem;">
            <span class="source-id-pill">SOURCE ${src.id}</span>
            ${statusBadgeHtml}
          </div>
          <div class="source-mode-toggle" role="group" aria-label="Input mode for Source ${src.id}">
            <button type="button" class="mode-btn ${isUrlMode ? 'active' : ''}" data-action="set-mode" data-index="${idx}" data-mode="url">
              Web URL
            </button>
            <button type="button" class="mode-btn ${!isUrlMode ? 'active' : ''}" data-action="set-mode" data-index="${idx}" data-mode="text">
              Pasted Text
            </button>
          </div>
          <button type="button" class="source-remove-btn" data-action="remove-source" data-index="${idx}" ${!canRemove ? 'disabled title="Minimum 2 sources required"' : 'title="Remove this source"'}>
            ✕ Remove
          </button>
        </div>

        <div class="source-input-wrap">
          ${
            isUrlMode
              ? `<input
                  type="url"
                  class="source-input-field ${src.hasError || src.errorMessage ? 'input-has-error' : ''}"
                  data-field="url"
                  data-index="${idx}"
                  placeholder="https://example.com/article..."
                  value="${escapeAttr(src.url || '')}"
                  aria-label="Source ${src.id} URL"
                >`
              : `<input
                  type="text"
                  class="source-input-field"
                  data-field="title"
                  data-index="${idx}"
                  placeholder="Document title or reference label (e.g. Clinical Study 2024)"
                  value="${escapeAttr(src.title || '')}"
                  style="margin-bottom: 0.5rem;"
                  aria-label="Source ${src.id} Title"
                >
                <textarea
                  class="source-input-field pasted-text-area ${src.hasError || src.errorMessage ? 'input-has-error' : ''}"
                  data-field="text"
                  data-index="${idx}"
                  rows="3"
                  placeholder="Paste raw source text or article excerpt here (minimum 50 characters)..."
                  aria-label="Source ${src.id} Content"
                >${escapeHtml(src.text || '')}</textarea>`
          }
          <div class="source-field-error" id="source-error-${idx}" ${src.errorMessage ? '' : 'hidden'}>${escapeHtml(src.errorMessage || '')}</div>
        </div>
      `;

      elements.sourcesList.appendChild(card);
    });

    // Update count badge & button state
    elements.sourceCountBadge.textContent = `${state.sources.length} of 5`;
    elements.addSourceBtn.disabled = state.sources.length >= 5;
  }

  function handleAddSource() {
    if (state.sources.length >= 5) return;
    const nextId = `S${state.sources.length + 1}`;
    state.sources.push({
      id: nextId,
      type: 'url',
      url: '',
      text: '',
      title: ''
    });
    renderSources();
  }

  function handleRemoveSource(index) {
    if (state.sources.length <= 2) return;
    state.sources.splice(index, 1);
    // Re-index remaining sources S1..SN
    state.sources.forEach((src, idx) => {
      src.id = `S${idx + 1}`;
    });
    renderSources();
  }

  function handleSourceModeToggle(index, newMode) {
    if (state.sources[index].type === newMode) return;
    state.sources[index].type = newMode;
    renderSources();
  }

  function handleSourceFieldChange(e) {
    const target = e.target;
    const field = target.dataset.field;
    const idx = parseInt(target.dataset.index, 10);
    if (!field || isNaN(idx) || !state.sources[idx]) return;

    state.sources[idx][field] = target.value;

    if (state.sources[idx].hasError || state.sources[idx].errorMessage) {
      delete state.sources[idx].hasError;
      delete state.sources[idx].errorMessage;
      delete state.sources[idx].fetchStatus;
      const errorDiv = document.getElementById(`source-error-${idx}`);
      if (errorDiv) {
        errorDiv.textContent = '';
        errorDiv.hidden = true;
      }
      target.classList.remove('input-has-error');
    }
  }

  function handleSampleClick(sampleKey) {
    const sample = SAMPLE_PROMPTS[sampleKey];
    if (!sample) return;

    elements.questionInput.value = sample.question;
    state.question = sample.question;

    // Deep clone sample sources
    state.sources = sample.sources.map((s, idx) => ({
      id: `S${idx + 1}`,
      type: s.type,
      url: s.url,
      text: s.text || '',
      title: s.title || ''
    }));

    clearErrors();
    renderSources();

    // Highlight active chip
    elements.sampleChips.forEach((chip) => {
      chip.classList.toggle('active', chip.dataset.sample === sampleKey);
    });
  }

  // =========================================================================
  // SCREEN 2: PROGRESSIVE LOADING CONTROL
  // =========================================================================

  const LOADING_STEPS = [
    'Reading sources...',
    'Extracting information...',
    'Comparing claims...',
    'Looking for gaps...',
    'Preparing verification checklist...'
  ];

  function setLoadingStep(stepIndex, customMessage) {
    const msg = customMessage || LOADING_STEPS[stepIndex - 1] || 'Processing...';
    elements.loadingMessage.textContent = msg;

    elements.stepDots.forEach((dot) => {
      const dotStep = parseInt(dot.dataset.step, 10);
      if (dotStep < stepIndex) {
        dot.className = 'step-dot completed';
      } else if (dotStep === stepIndex) {
        dot.className = 'step-dot active';
      } else {
        dot.className = 'step-dot';
      }
    });
  }

  function startProgressiveLoading() {
    elements.inputSection.hidden = true;
    elements.resultsSection.hidden = true;
    elements.loadingSection.hidden = false;
    setLoadingStep(1, LOADING_STEPS[0]);

    let currentStep = 1;
    clearInterval(state.loadingTimer);
    state.loadingTimer = setInterval(() => {
      if (currentStep < 4) {
        currentStep++;
        setLoadingStep(currentStep, LOADING_STEPS[currentStep - 1]);
      }
    }, 2800);
  }

  function stopLoading() {
    clearInterval(state.loadingTimer);
    elements.loadingSection.hidden = true;
  }

  // =========================================================================
  // FORM VALIDATION & WORKFLOW EXECUTION
  // =========================================================================

  function validateInput() {
    clearErrors();
    let isValid = true;
    let firstErrorElement = null;

    // 1. Research Question Validation
    const question = elements.questionInput ? elements.questionInput.value.trim() : '';
    if (!question) {
      setQuestionError('Please enter a research question.');
      showError('Please enter a research question.');
      isValid = false;
      if (!firstErrorElement && elements.questionInput) firstErrorElement = elements.questionInput;
    } else if (question.length > 1000) {
      setQuestionError('Question exceeds 1,000 characters limit.');
      showError('Question exceeds 1,000 characters limit.');
      isValid = false;
      if (!firstErrorElement && elements.questionInput) firstErrorElement = elements.questionInput;
    }

    // Source count check
    if (!state.sources || state.sources.length < 2) {
      const bannerMsg = 'Add at least two valid sources to continue.';
      showError(bannerMsg);
      return { valid: false, error: bannerMsg };
    }
    if (state.sources.length > 5) {
      const bannerMsg = 'Maximum 5 sources allowed.';
      showError(bannerMsg);
      return { valid: false, error: bannerMsg };
    }

    // 2. Source Validation
    const seenUrls = new Set();
    let validCount = 0;
    let invalidUrlDetected = false;
    let duplicateDetected = false;
    let shortPastedDetected = false;

    state.sources.forEach((src, idx) => {
      if (src.type === 'url') {
        const rawUrl = (src.url || '').trim();
        if (!rawUrl) {
          setSourceError(idx, 'Please enter a valid HTTP or HTTPS URL.');
          invalidUrlDetected = true;
          return;
        }

        if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
          setSourceError(idx, 'Please enter a valid HTTP or HTTPS URL.');
          invalidUrlDetected = true;
          return;
        }

        try {
          const parsed = new URL(rawUrl);
          const host = (parsed.hostname || '').toLowerCase();
          if (!host || !host.includes('.')) {
            setSourceError(idx, 'Please enter a valid HTTP or HTTPS URL.');
            invalidUrlDetected = true;
            return;
          }
          const isPrivateIp = /^(?:127\.|10\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.|169\.254\.|0\.0\.0\.0)/.test(host);
          if (
            host === 'localhost' ||
            host.endsWith('.local') ||
            host.includes('sample.digitaldarkspot.local') ||
            host.endsWith('.internal') ||
            host.endsWith('.lan') ||
            host.endsWith('.home') ||
            host.endsWith('.corp') ||
            isPrivateIp
          ) {
            setSourceError(idx, 'Internal, private, and local addresses (.local) cannot be fetched. Please enter a public web URL or switch to Pasted Text mode.');
            invalidUrlDetected = true;
            return;
          }
        } catch {
          setSourceError(idx, 'Please enter a valid HTTP or HTTPS URL.');
          invalidUrlDetected = true;
          return;
        }

        const normalized = rawUrl.toLowerCase().replace(/\/+$/, '');
        if (seenUrls.has(normalized)) {
          setSourceError(idx, 'Duplicate source URL. Each source must be unique.');
          duplicateDetected = true;
          return;
        }
        seenUrls.add(normalized);
        validCount++;
      } else {
        const text = (src.text || '').trim();
        if (!text) {
          setSourceError(idx, 'Please provide at least 50 characters of source text.');
          shortPastedDetected = true;
          return;
        }
        if (text.length < 50) {
          setSourceError(idx, 'Pasted text is too short. Please provide at least 50 characters.');
          shortPastedDetected = true;
          return;
        }
        validCount++;
      }
    });

    if (!isValid) {
      // Question was invalid
      return { valid: false, error: !question ? 'Please enter a research question.' : 'Question exceeds 1,000 characters limit.' };
    }

    if (validCount < 2) {
      let bannerMsg = 'Add at least two valid sources to continue.';
      if (invalidUrlDetected && validCount === 0 && state.sources.some((s) => (s.url || '').trim().length > 0)) {
        bannerMsg = 'Please enter a valid HTTP or HTTPS URL.';
      }
      showError(bannerMsg);
      return { valid: false, error: bannerMsg };
    }

    if (invalidUrlDetected) {
      showError('Please enter a valid HTTP or HTTPS URL.');
      return { valid: false, error: 'Please enter a valid HTTP or HTTPS URL.' };
    }

    if (duplicateDetected) {
      showError('Duplicate source URL. Each source must be unique.');
      return { valid: false, error: 'Duplicate source URL. Each source must be unique.' };
    }

    if (shortPastedDetected) {
      showError('Pasted text is too short. Please provide at least 50 characters.');
      return { valid: false, error: 'Pasted text is too short. Please provide at least 50 characters.' };
    }

    return { valid: true };
  }

  // =========================================================================
  // STEP 4: OFFLINE SAMPLE DEMO HANDLER (NO API CALLS)
  // =========================================================================

  function handleSampleDemo(e) {
    if (e) {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
    }

    clearErrors();

    // Immediately hide previous results & clear analysis state
    if (elements.resultsSection) elements.resultsSection.hidden = true;
    state.analysis = null;

    // Strict validation: Sample Demo requires valid inputs before proceeding
    const validation = validateInput();
    if (!validation.valid) {
      showError(validation.error);
      return;
    }

    const demo = window.SAMPLE_DEMO_DATA;
    if (!demo || !demo.sources || !demo.analysis) {
      showError('Sample demo dataset not found or incomplete. Please verify sample-data.js is loaded.');
      return;
    }

    // Preserve the user's valid live input configuration
    if (!state.isSampleDemo) {
      state.savedLiveSources = JSON.parse(JSON.stringify(state.sources));
      state.savedLiveQuestion = elements.questionInput ? elements.questionInput.value : state.question;
    }

    // Activate offline sample demo mode
    state.isSampleDemo = true;
    state.fetchedSources = demo.sources;
    state.analysis = demo.analysis;
    state.checkedItems.clear();

    // Immediately switch screens: hide inputs and loading, reveal results dossier
    if (elements.loadingSection) elements.loadingSection.hidden = true;
    if (elements.inputSection) elements.inputSection.hidden = true;
    if (elements.resultsSection) elements.resultsSection.hidden = false;

    // Render precomputed verification dossier
    renderResults(demo.analysis);

    // Scroll washi sheet to top of results cleanly
    const paper = document.querySelector('#foot .paper-scroll');
    if (paper) {
      paper.scrollTop = 0;
    } else if (elements.resultsSection && elements.resultsSection.scrollIntoView) {
      elements.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // Toast notification confirming offline sample mode
    showToast('Sample Demo loaded offline — no API requests performed.');
  }

  // Expose globally so inline onclick handler works immediately
  window.__handleSampleDemo = handleSampleDemo;
  window.__digitalDarkSpot = {
    getState: () => state,
    validateInput,
    handleSampleDemo,
    handleFormSubmit,
    handleBackToInput,
    renderResults,
    elements
  };

  async function handleFormSubmit(e) {
    if (e) e.preventDefault();
    clearErrors();
    state.isSampleDemo = false;

    // Reset previous live analysis results & hide section
    if (elements.resultsSection) elements.resultsSection.hidden = true;
    state.analysis = null;

    const validation = validateInput();
    if (!validation.valid) {
      showError(validation.error);
      return;
    }

    state.question = elements.questionInput.value.trim();

    // Disable submit button during execution to prevent multiple requests
    if (elements.submitBtn) {
      elements.submitBtn.disabled = true;
      elements.submitBtn.textContent = 'Analyzing...';
    }

    startProgressiveLoading();

    try {
      // 1. Separate URL sources needing HTTP fetching from pasted text sources
      const urlSourcesToFetch = [];
      state.sources.forEach((s) => {
        if (s.type === 'url') {
          urlSourcesToFetch.push({ id: s.id, url: s.url.trim() });
        }
      });

      let fetchedUrlResults = [];
      if (urlSourcesToFetch.length > 0) {
        setLoadingStep(1, 'Reading sources...');
        let fetchRes;
        try {
          fetchRes = await fetch('/api/fetch-sources', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sources: urlSourcesToFetch })
          });
        } catch {
          throw new Error('AI analysis is temporarily unavailable. Please check the server configuration.');
        }

        const fetchJson = await fetchRes.json().catch(() => ({}));
        if (!fetchRes.ok || !fetchJson.success) {
          throw new Error(fetchJson.error || 'Failed to fetch external web sources.');
        }
        fetchedUrlResults = fetchJson.sources || [];
      }

      setLoadingStep(2, 'Extracting clean content...');

      // 2. Assemble complete source payload for Gemini
      const combinedSources = state.sources.map((s) => {
        if (s.type === 'url') {
          const match = fetchedUrlResults.find((f) => f.id === s.id);
          if (match && match.fetchStatus === 'success' && match.text && match.text.trim().length >= 50) {
            return {
              id: s.id,
              type: 'url',
              url: match.url,
              title: match.title || null,
              text: match.text,
              detectedDate: match.detectedDate || null,
              fetchStatus: 'success',
              error: null
            };
          }
          return {
            id: s.id,
            type: 'url',
            url: s.url.trim(),
            title: match ? match.title : null,
            text: '',
            detectedDate: null,
            fetchStatus: 'failed',
            error: (match && match.error) ? match.error : 'Failed to retrieve or extract content from this source.'
          };
        } else {
          // Pasted text source
          return {
            id: s.id,
            type: 'text',
            url: s.title ? `Pasted: ${s.title.trim()}` : `Pasted Source (${s.id})`,
            title: s.title ? s.title.trim() : `Pasted Document ${s.id}`,
            text: s.text.trim(),
            detectedDate: null,
            fetchStatus: 'success',
            error: null
          };
        }
      });

      state.fetchedSources = combinedSources;

      // Update state.sources status and errors so UI reflects them
      combinedSources.forEach((cs) => {
        const matching = state.sources.find((s) => s.id === cs.id);
        if (matching) {
          matching.fetchStatus = cs.fetchStatus;
          matching.errorMessage = cs.error;
          if (cs.text) matching.text = cs.text;
          if (cs.title) matching.title = cs.title;
        }
      });

      renderSources();

      // Require at least 2 usable sources
      const usableSources = combinedSources.filter(
        (s) => s.fetchStatus === 'success' && s.text && s.text.trim().length >= 50
      );

      if (usableSources.length < 2) {
        stopLoading();
        elements.inputSection.hidden = false;
        elements.resultsSection.hidden = true;
        if (elements.submitBtn) {
          elements.submitBtn.disabled = false;
          elements.submitBtn.innerHTML = 'Analyse Sources <span aria-hidden="true">→</span>';
        }

        const failedSources = combinedSources.filter(
          (s) => s.fetchStatus !== 'success' || !s.text || s.text.trim().length < 50
        );
        const failureDetails = failedSources
          .map((s) => `${s.id}: ${s.error || 'Failed to extract content'}`)
          .join(' · ');

        let detailedMsg = 'Unable to proceed with analysis. ';
        if (usableSources.length === 0) {
          detailedMsg += `None of the provided sources could be accessed (${failureDetails}). Please provide at least two valid public URLs or switch to Pasted Text mode.`;
        } else {
          detailedMsg += `Only 1 source was accessible (${usableSources[0].id}). Cross-examination requires at least two usable sources. Please resolve the inaccessible source (${failureDetails}) or add another source.`;
        }

        showError(detailedMsg);
        return;
      }

      setLoadingStep(3, 'Comparing claims across sources...');

      // 3. Call POST /api/analyze with Gemini backend
      let analyzeRes;
      try {
        analyzeRes = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: state.question,
            sources: combinedSources
          })
        });
      } catch {
        throw new Error('AI analysis is temporarily unavailable. Please check the server configuration.');
      }

      const analyzeJson = await analyzeRes.json().catch(() => ({}));
      if (!analyzeRes.ok || !analyzeJson.success) {
        const status = analyzeRes.status;
        let errMsg = analyzeJson.error || 'Failed to analyze sources with Gemini.';
        if (status === 401 || status === 403) {
          errMsg = analyzeJson.error || 'AI analysis is temporarily unavailable. Please check the server configuration.';
        } else if (status === 429) {
          errMsg = analyzeJson.error || 'The AI service is temporarily busy. Please try again shortly.';
        }
        throw new Error(errMsg);
      }

      setLoadingStep(5, 'Preparing verification checklist...');
      state.analysis = analyzeJson;

      // Subtle pause for visual finish
      setTimeout(() => {
        stopLoading();
        renderResults(analyzeJson);
        elements.resultsSection.hidden = false;
        if (elements.submitBtn) {
          elements.submitBtn.disabled = false;
          elements.submitBtn.innerHTML = 'Analyse Sources <span aria-hidden="true">→</span>';
        }
        elements.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 450);
    } catch (err) {
      stopLoading();
      elements.inputSection.hidden = false;
      elements.resultsSection.hidden = true;
      state.analysis = null;
      if (elements.submitBtn) {
        elements.submitBtn.disabled = false;
        elements.submitBtn.innerHTML = 'Analyse Sources <span aria-hidden="true">→</span>';
      }
      showError(err.message || 'An unexpected error occurred during analysis.');
    }
  }

  // =========================================================================
  // SCREEN 3: RESULTS DASHBOARD (WASHI PAPER DOSSIER) RENDERING
  // =========================================================================

  function renderResults(data) {
    const isSample = Boolean(data.isSampleDemo || state.isSampleDemo);

    // 1. Header & Question
    elements.dossierQuestion.textContent = data.question || state.question;
    if (isSample) {
      elements.dossierModelTag.textContent = 'SAMPLE DATA · Offline Demo';
      elements.dossierModelTag.classList.add('sample-tag');
      if (elements.sampleDemoNoticeBanner) elements.sampleDemoNoticeBanner.hidden = false;
    } else {
      const activeModel = data.model_used || data.model || 'gemini-3.8-flash';
      const provider = (data.provider_used || data.provider || 'gemini').toLowerCase();
      const isFallback = Boolean(data.is_fallback || (activeModel && activeModel !== 'gemini-3.8-flash') || provider === 'groq');

      if (provider === 'groq') {
        elements.dossierModelTag.textContent = `Groq (${activeModel} · Fallback)`;
      } else {
        elements.dossierModelTag.textContent = isFallback
          ? `Gemini Flash (${activeModel} · Fallback)`
          : `Gemini Flash (${activeModel})`;
      }
      elements.dossierModelTag.classList.remove('sample-tag');
      if (elements.sampleDemoNoticeBanner) elements.sampleDemoNoticeBanner.hidden = true;
    }

    // 2. Confidence Strip
    const confidence = (data.overall_confidence || 'medium').toLowerCase();
    elements.confidenceBadge.textContent = confidence.toUpperCase();
    elements.confidenceBadge.className = `confidence-badge ${confidence}`;
    elements.confidenceNote.textContent = data.confidence_note || 'Confidence reflects agreement and coverage across submitted sources.';

    // 3. Verbatim Evidence Audit Stats
    const stats = data.evidence_verification || { totalChecked: 0, verifiedCount: 0 };
    elements.auditVerifiedCount.textContent = stats.verifiedCount;
    elements.auditTotalCount.textContent = stats.totalChecked;

    // 4. Section A: Structured Summary
    renderSectionA(data.summary || []);

    // 5. Section B: Potential Gaps
    renderSectionB(data.gaps || []);

    // 6. Section C: Potential Conflicts
    renderSectionC(data.conflicts || []);

    // 7. Section D: Outdated / Undated Signals
    renderSectionD(data.outdated || []);

    // 8. Section E: Unanswered Questions
    renderSectionE(data.unanswered_questions || []);

    // 9. Section 4: Verify Next Checklist
    renderChecklist(data.checklist || []);

    // 10. Section F: Source Manifest
    renderSourceManifest(state.fetchedSources);
  }

  function renderSectionA(summaryItems) {
    if (!summaryItems.length) {
      elements.summaryContainer.innerHTML = `
        <div class="empty-notice"><p>No factual summary items generated.</p></div>
      `;
      return;
    }

    elements.summaryContainer.innerHTML = summaryItems
      .map((item) => {
        const isVerified = !item.verification || item.verification.verified;
        const pillClass = isVerified ? 'evidence-pill' : 'evidence-pill unverified';
        const pillText = isVerified ? 'VERIFIED' : 'UNVERIFIED QUOTE';

        return `
          <div class="summary-card">
            <p class="summary-point">${escapeHtml(item.point)}</p>
            <div class="evidence-strip-meta">
              <button
                type="button"
                class="source-citation-btn"
                data-action="open-drawer"
                data-source-id="${escapeAttr(item.source_id)}"
                data-quote="${escapeAttr(item.evidence || '')}"
                data-status="${isVerified ? 'verified' : 'unverified'}"
                title="View original evidence in Source ${escapeAttr(item.source_id)}"
              >
                [${escapeHtml(item.source_id)}]
              </button>
              ${
                item.evidence
                  ? `<span class="${pillClass}">
                      "${escapeHtml(item.evidence)}"
                      <strong>${pillText}</strong>
                    </span>`
                  : ''
              }
            </div>
          </div>
        `;
      })
      .join('');
  }

  function renderSectionB(gaps) {
    if (!gaps.length) {
      elements.gapsContainer.innerHTML = `
        <div class="empty-notice"><p>No critical information gaps identified across reviewed sources.</p></div>
      `;
      return;
    }

    elements.gapsContainer.innerHTML = gaps
      .map((gap) => {
        const priority = (gap.priority || 'medium').toLowerCase();
        const sourcesReviewedHtml = (gap.sources_reviewed || [])
          .map(
            (id) => `
            <button
              type="button"
              class="source-citation-btn"
              data-action="open-drawer"
              data-source-id="${escapeAttr(id)}"
              title="Inspect Source ${escapeAttr(id)}"
            >
              [${escapeHtml(id)}]
            </button>
          `
          )
          .join(' ');

        const evidenceHtml = (gap.evidence || [])
          .map((ev) => {
            const isVerified = !ev.verification || ev.verification.verified;
            const pillClass = isVerified ? 'evidence-pill' : 'evidence-pill unverified';
            const pillText = isVerified ? 'VERIFIED' : 'UNVERIFIED QUOTE';
            return `
              <div class="evidence-strip-meta" style="margin-top: 0.35rem;">
                <button
                  type="button"
                  class="source-citation-btn"
                  data-action="open-drawer"
                  data-source-id="${escapeAttr(ev.source_id)}"
                  data-quote="${escapeAttr(ev.snippet || '')}"
                  data-status="${isVerified ? 'verified' : 'unverified'}"
                >
                  [${escapeHtml(ev.source_id)}]
                </button>
                <span class="${pillClass}">
                  "${escapeHtml(ev.snippet)}"
                  <strong>${pillText}</strong>
                </span>
              </div>
            `;
          })
          .join('');

        return `
          <div class="gap-card">
            <div class="gap-top-line">
              <h4 class="gap-title">${escapeHtml(gap.title)}</h4>
              <span class="priority-tag ${priority}">${priority.toUpperCase()} PRIORITY</span>
            </div>
            <p class="gap-explanation">${escapeHtml(gap.why_it_matters)}</p>
            <div class="gap-meta-row">
              <span>Reviewed in:</span> ${sourcesReviewedHtml || 'None specified'}
            </div>
            ${evidenceHtml}
          </div>
        `;
      })
      .join('');
  }

  function renderSectionC(conflicts) {
    if (!conflicts.length) {
      elements.conflictsContainer.innerHTML = `
        <div class="empty-notice">
          <p>No direct factual contradictions identified between the submitted sources.</p>
        </div>
      `;
      return;
    }

    elements.conflictsContainer.innerHTML = conflicts
      .map((c) => {
        const aVerified = !c.claim_a.verification || c.claim_a.verification.verified;
        const bVerified = !c.claim_b.verification || c.claim_b.verification.verified;

        return `
          <div class="conflict-card">
            <h4 class="conflict-topic">Contradiction: ${escapeHtml(c.topic)}</h4>
            <div class="conflict-grid">

              <!-- Claim A -->
              <div class="conflict-claim-box">
                <div class="claim-label">
                  CLAIM A · SOURCE
                  <button
                    type="button"
                    class="source-citation-btn"
                    data-action="open-drawer"
                    data-source-id="${escapeAttr(c.claim_a.source_id)}"
                    data-quote="${escapeAttr(c.claim_a.evidence || '')}"
                    data-status="${aVerified ? 'verified' : 'unverified'}"
                  >
                    [${escapeHtml(c.claim_a.source_id)}]
                  </button>
                </div>
                <p class="claim-text">${escapeHtml(c.claim_a.claim)}</p>
                ${
                  c.claim_a.evidence
                    ? `<div class="evidence-strip-meta">
                        <span class="${aVerified ? 'evidence-pill' : 'evidence-pill unverified'}">
                          "${escapeHtml(c.claim_a.evidence)}"
                          <strong>${aVerified ? 'VERIFIED' : 'UNVERIFIED QUOTE'}</strong>
                        </span>
                      </div>`
                    : ''
                }
              </div>

              <!-- Claim B -->
              <div class="conflict-claim-box">
                <div class="claim-label">
                  CLAIM B · SOURCE
                  <button
                    type="button"
                    class="source-citation-btn"
                    data-action="open-drawer"
                    data-source-id="${escapeAttr(c.claim_b.source_id)}"
                    data-quote="${escapeAttr(c.claim_b.evidence || '')}"
                    data-status="${bVerified ? 'verified' : 'unverified'}"
                  >
                    [${escapeHtml(c.claim_b.source_id)}]
                  </button>
                </div>
                <p class="claim-text">${escapeHtml(c.claim_b.claim)}</p>
                ${
                  c.claim_b.evidence
                    ? `<div class="evidence-strip-meta">
                        <span class="${bVerified ? 'evidence-pill' : 'evidence-pill unverified'}">
                          "${escapeHtml(c.claim_b.evidence)}"
                          <strong>${bVerified ? 'VERIFIED' : 'UNVERIFIED QUOTE'}</strong>
                        </span>
                      </div>`
                    : ''
                }
              </div>

            </div>
          </div>
        `;
      })
      .join('');
  }

  function renderSectionD(outdated) {
    if (!outdated.length) {
      elements.outdatedContainer.innerHTML = `
        <div class="empty-notice">
          <p>No timeline or obsolescence risks detected across reviewed sources.</p>
        </div>
      `;
      return;
    }

    elements.outdatedContainer.innerHTML = outdated
      .map((item) => {
        const isVerified = !item.verification || item.verification.verified;
        const dateDisplay = item.detected_date ? `Anchored Date: ${escapeHtml(item.detected_date)}` : 'Undated / Missing Timestamp';

        return `
          <div class="outdated-card">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:0.5rem; flex-wrap:wrap;">
              <span class="outdated-signal">${escapeHtml(item.signal)}</span>
              <span class="outdated-date-badge">⏳ ${dateDisplay}</span>
            </div>
            <p class="outdated-reason">${escapeHtml(item.reason)}</p>
            <div class="evidence-strip-meta">
              <button
                type="button"
                class="source-citation-btn"
                data-action="open-drawer"
                data-source-id="${escapeAttr(item.source_id)}"
                data-quote="${escapeAttr(item.evidence || '')}"
                data-status="${isVerified ? 'verified' : 'unverified'}"
              >
                [${escapeHtml(item.source_id)}]
              </button>
              ${
                item.evidence
                  ? `<span class="${isVerified ? 'evidence-pill' : 'evidence-pill unverified'}">
                      "${escapeHtml(item.evidence)}"
                      <strong>${isVerified ? 'VERIFIED' : 'UNVERIFIED QUOTE'}</strong>
                    </span>`
                  : ''
              }
            </div>
          </div>
        `;
      })
      .join('');
  }

  function renderSectionE(unanswered) {
    if (!unanswered.length) {
      elements.unansweredContainer.innerHTML = `
        <div class="empty-notice">
          <p>All immediate research questions addressed within submitted sources.</p>
        </div>
      `;
      return;
    }

    elements.unansweredContainer.innerHTML = unanswered
      .map((q) => {
        const relatedHtml = (q.related_sources || [])
          .map(
            (id) => `
            <button
              type="button"
              class="source-citation-btn"
              data-action="open-drawer"
              data-source-id="${escapeAttr(id)}"
            >
              [${escapeHtml(id)}]
            </button>
          `
          )
          .join(' ');

        return `
          <div class="unanswered-card">
            <h4 class="unanswered-q">❓ ${escapeHtml(q.question)}</h4>
            <p class="unanswered-why">${escapeHtml(q.why_it_matters)}</p>
            <div class="gap-meta-row">
              <span>Related to:</span> ${relatedHtml || 'General topic'}
            </div>
          </div>
        `;
      })
      .join('');
  }

  function renderChecklist(checklistItems) {
    state.checkedItems.clear();
    updateChecklistProgress(checklistItems.length);

    if (!checklistItems.length) {
      elements.checklistContainer.innerHTML = `
        <div class="empty-notice"><p>No verification items generated.</p></div>
      `;
      return;
    }

    elements.checklistContainer.innerHTML = checklistItems
      .map((item, idx) => {
        const priority = (item.priority || 'medium').toLowerCase();
        const relatedHtml = (item.related_sources || [])
          .map(
            (id) => `
            <button
              type="button"
              class="source-citation-btn"
              data-action="open-drawer"
              data-source-id="${escapeAttr(id)}"
            >
              [${escapeHtml(id)}]
            </button>
          `
          )
          .join(' ');

        return `
          <div class="checklist-item-card" id="checklist-item-${idx}">
            <input
              type="checkbox"
              class="checklist-checkbox"
              id="chk-${idx}"
              data-index="${idx}"
              aria-label="Verify: ${escapeAttr(item.item)}"
            >
            <div class="checklist-content">
              <div class="checklist-top">
                <label for="chk-${idx}" class="checklist-title">${escapeHtml(item.item)}</label>
                <span class="priority-tag ${priority}">${priority.toUpperCase()}</span>
              </div>
              <p class="checklist-reason">${escapeHtml(item.reason)}</p>
              <div class="checklist-dest">
                <span>🔍 Verify at:</span> <strong>${escapeHtml(item.verify_at)}</strong>
                ${relatedHtml ? `<span style="margin-left:0.5rem;">Sources: ${relatedHtml}</span>` : ''}
              </div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  function updateChecklistProgress(totalCount) {
    const total = typeof totalCount === 'number' ? totalCount : (state.analysis && state.analysis.checklist ? state.analysis.checklist.length : 0);
    const checked = state.checkedItems.size;
    elements.checklistProgressPill.textContent = `${checked} of ${total} verified`;
    const percent = total > 0 ? Math.round((checked / total) * 100) : 0;
    elements.checklistProgressBar.style.width = `${percent}%`;
  }

  function handleChecklistChange(e) {
    if (!e.target.classList.contains('checklist-checkbox')) return;
    const idx = parseInt(e.target.dataset.index, 10);
    const card = document.getElementById(`checklist-item-${idx}`);

    if (e.target.checked) {
      state.checkedItems.add(idx);
      if (card) card.classList.add('checked');
    } else {
      state.checkedItems.delete(idx);
      if (card) card.classList.remove('checked');
    }

    updateChecklistProgress();
  }

  function handleCopyChecklist() {
    if (!state.analysis || !state.analysis.checklist || !state.analysis.checklist.length) {
      showToast('No checklist items to copy.');
      return;
    }

    const lines = [
      `# Digital Dark Spot — Verification Checklist`,
      `Research Question: ${state.question}`,
      `Date Generated: ${new Date().toLocaleDateString()}`,
      '',
      ...state.analysis.checklist.map((item, idx) => {
        const isChecked = state.checkedItems.has(idx) ? '[x]' : '[ ]';
        const prio = (item.priority || 'medium').toUpperCase();
        return `${isChecked} [${prio}] ${item.item}\n    Why: ${item.reason}\n    Verify at: ${item.verify_at}`;
      })
    ];

    const copyText = lines.join('\n');
    const onCopied = () => {
      const originalText = elements.copyChecklistBtn.textContent;
      elements.copyChecklistBtn.textContent = '✓ Copied!';
      showToast('Checklist copied to clipboard!');
      setTimeout(() => {
        elements.copyChecklistBtn.textContent = originalText;
      }, 2500);
    };

    if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(copyText).then(onCopied).catch(() => {
        fallbackCopyText(copyText, onCopied);
      });
    } else {
      fallbackCopyText(copyText, onCopied);
    }
  }

  function fallbackCopyText(text, cb) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      if (cb) cb();
    } catch {
      showToast('Checklist copied to clipboard!');
    }
  }

  function handleDownloadChecklist() {
    if (!state.analysis || !state.analysis.checklist || !state.analysis.checklist.length) {
      showToast('No checklist items to download.');
      return;
    }

    const lines = [
      `=======================================================`,
      `DIGITAL DARK SPOT — VERIFICATION ACTION CHECKLIST`,
      `=======================================================`,
      `Question: ${state.question}`,
      `Exported: ${new Date().toISOString()}`,
      `Confidence: ${(state.analysis.overall_confidence || 'medium').toUpperCase()}`,
      `=======================================================`,
      '',
      ...state.analysis.checklist.map((item, idx) => {
        const isChecked = state.checkedItems.has(idx) ? '[VERIFIED]' : '[PENDING ]';
        const prio = (item.priority || 'medium').toUpperCase();
        return `${isChecked} [${prio}] ${item.item}\n  - Importance: ${item.reason}\n  - Recommended Authority: ${item.verify_at}\n  - Related Sources: ${(item.related_sources || []).join(', ')}\n`;
      })
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `digital-dark-spot-checklist-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Checklist downloaded as .txt file!');
  }

  function renderSourceManifest(sources) {
    if (!sources || !sources.length) {
      elements.sourcesManifestContainer.innerHTML = `
        <div class="empty-notice"><p>No source manifest available.</p></div>
      `;
      return;
    }

    elements.sourcesManifestContainer.innerHTML = sources
      .map((s) => {
        const isSuccess = s.fetchStatus === 'success';
        const dateText = s.detectedDate ? `Publication Date: ${escapeHtml(s.detectedDate)}` : 'Publication Date: Not detected';
        const isUrl = s.url && (s.url.startsWith('http://') || s.url.startsWith('https://'));

        return `
          <div class="manifest-card">
            <div class="manifest-info">
              <div class="manifest-title-line">
                <span class="manifest-id">[${escapeHtml(s.id)}]</span>
                <span class="manifest-title">${escapeHtml(s.title || (isUrl ? s.url : 'Pasted Text Source'))}</span>
              </div>
              <div>
                ${
                  isUrl
                    ? `<a href="${escapeAttr(s.url)}" target="_blank" rel="noopener noreferrer" class="manifest-url">${escapeHtml(s.url)} ↗</a>`
                    : `<span class="manifest-url">${escapeHtml(s.url || 'Pasted Source Text')}</span>`
                }
              </div>
              <div class="manifest-meta">
                <span>${dateText}</span> ·
                <span style="color: ${isSuccess ? 'var(--pine-green)' : 'var(--vermilion)'};">
                  ${isSuccess ? 'Clean Content Extracted' : escapeHtml(s.error || 'Fetch Error')}
                </span>
              </div>
            </div>
            <div>
              <button
                type="button"
                class="btn-manifest-view"
                data-action="open-drawer"
                data-source-id="${escapeAttr(s.id)}"
              >
                View Extracted Text
              </button>
            </div>
          </div>
        `;
      })
      .join('');
  }

  // =========================================================================
  // SOURCE EVIDENCE DRAWER CONTROLLER
  // =========================================================================

  function openEvidenceDrawer(sourceId, quoteSnippet, verificationStatus) {
    // 1. Locate source in fetchedSources or original sources
    const source = (state.fetchedSources || []).find((s) => s.id === sourceId) ||
      state.sources.find((s) => s.id === sourceId) || {
        id: sourceId,
        title: `Source ${sourceId}`,
        url: 'Unknown',
        text: 'Source content not available.',
        detectedDate: null,
        fetchStatus: 'error'
      };

    if (state.isSampleDemo) {
      elements.drawerBadge.textContent = `SAMPLE DATA · SOURCE ${source.id}`;
      elements.drawerStatus.textContent = 'Fictional Source Text (Offline Sample Data)';
    } else {
      elements.drawerBadge.textContent = `SOURCE ${source.id}`;
      elements.drawerStatus.textContent = source.fetchStatus === 'success' ? 'Clean Extracted HTML/Text' : (source.error || 'Fetch Failed');
    }
    elements.drawerTitle.textContent = source.title || (source.url.startsWith('http') ? source.url : `Document ${source.id}`);
    elements.drawerUrl.textContent = source.url || 'Pasted Content';
    elements.drawerDate.textContent = source.detectedDate || 'No publication date detected';

    // 2. Quote highlight box
    if (quoteSnippet && quoteSnippet.trim()) {
      elements.drawerQuoteBox.hidden = false;
      elements.drawerQuoteText.textContent = `"${quoteSnippet.trim()}"`;
      const isVerified = verificationStatus === 'verified';
      elements.drawerVerificationBadge.textContent = isVerified ? 'VERIFIED' : 'UNVERIFIED QUOTE';
      elements.drawerVerificationBadge.className = `verification-badge ${isVerified ? 'verified' : 'unverified'}`;
    } else {
      elements.drawerQuoteBox.hidden = true;
    }

    // 3. Render clean source text with quote highlight
    elements.drawerSourceText.innerHTML = highlightSnippetInText(source.text || '(No text content available)', quoteSnippet);

    // 4. Reveal drawer modal
    elements.drawer.removeAttribute('hidden');
    document.body.classList.add('drawer-open');
    elements.drawerCloseBtn.focus();

    // 5. Scroll to highlighted quote if present
    setTimeout(() => {
      const mark = elements.drawerSourceText.querySelector('mark');
      if (mark) {
        mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        elements.drawerSourceText.scrollTop = 0;
      }
    }, 120);
  }

  function highlightSnippetInText(rawText, snippet) {
    if (!rawText) return '<p><em>No extracted text found.</em></p>';
    if (!snippet || !snippet.trim()) {
      return escapeHtml(rawText)
        .split(/\n\n+/)
        .map((p) => `<p>${p.trim()}</p>`)
        .join('');
    }

    const cleanSnippet = snippet.trim();
    let idx = rawText.indexOf(cleanSnippet);
    let matchLen = cleanSnippet.length;

    // Case-insensitive match if exact fails
    if (idx === -1) {
      idx = rawText.toLowerCase().indexOf(cleanSnippet.toLowerCase());
    }

    // Flexible whitespace regex if still not matched
    if (idx === -1) {
      try {
        const escaped = cleanSnippet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
        const regex = new RegExp(escaped, 'i');
        const match = regex.exec(rawText);
        if (match) {
          idx = match.index;
          matchLen = match[0].length;
        }
      } catch {
        // Fallback to plain text
      }
    }

    if (idx !== -1) {
      const before = escapeHtml(rawText.slice(0, idx));
      const matched = escapeHtml(rawText.slice(idx, idx + matchLen));
      const after = escapeHtml(rawText.slice(idx + matchLen));

      const combined = `${before}<mark class="highlight-quote">${matched}</mark>${after}`;
      return combined
        .split(/\n\n+/)
        .map((p) => `<p>${p.trim()}</p>`)
        .join('');
    }

    // If snippet not found verbatim, display note and full text
    return (
      `<div style="font-size: 0.75rem; color: var(--vermilion); margin-bottom: 0.75rem; padding: 0.4rem; background: var(--vermilion-soft); border-radius: 3px;">Note: Evidence quote could not be located verbatim in the extracted source text.</div>` +
      escapeHtml(rawText)
        .split(/\n\n+/)
        .map((p) => `<p>${p.trim()}</p>`)
        .join('')
    );
  }

  function closeEvidenceDrawer() {
    elements.drawer.setAttribute('hidden', '');
    document.body.classList.remove('drawer-open');
  }

  // =========================================================================
  // BACK TO INPUT / NAVIGATION
  // =========================================================================

  function handleBackToInput(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (elements.resultsSection) elements.resultsSection.hidden = true;
    if (elements.loadingSection) elements.loadingSection.hidden = true;
    if (elements.inputSection) elements.inputSection.hidden = false;
    if (elements.submitBtn) {
      elements.submitBtn.disabled = false;
      elements.submitBtn.innerHTML = 'Analyse Sources <span aria-hidden="true">→</span>';
    }

    // If returning from offline Sample Demo mode, restore the user's live inputs
    if (state.isSampleDemo) {
      state.isSampleDemo = false;
      if (state.savedLiveSources && state.savedLiveSources.length >= 2) {
        state.sources = state.savedLiveSources;
        state.question = state.savedLiveQuestion || '';
      } else {
        state.sources = [
          { id: 'S1', type: 'url', url: '', text: '', title: '' },
          { id: 'S2', type: 'url', url: '', text: '', title: '' }
        ];
        state.question = '';
      }
      if (elements.questionInput) {
        elements.questionInput.value = state.question;
      }
    }

    clearErrors();
    renderSources();
    const paper = document.querySelector('#foot .paper-scroll');
    if (paper) {
      paper.scrollTop = 0;
    } else if (elements.inputSection && elements.inputSection.scrollIntoView) {
      elements.inputSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // =========================================================================
  // EVENT LISTENERS & INITIALIZATION
  // =========================================================================

  function initEventListeners() {
    // 1. Sources List interactions (mode toggle, remove, input change)
    elements.sourcesList.addEventListener('click', (e) => {
      const target = e.target.closest('[data-action]');
      if (!target) return;

      const action = target.dataset.action;
      const idx = parseInt(target.dataset.index, 10);

      if (action === 'set-mode') {
        const mode = target.dataset.mode;
        handleSourceModeToggle(idx, mode);
      } else if (action === 'remove-source') {
        handleRemoveSource(idx);
      }
    });

    elements.sourcesList.addEventListener('input', handleSourceFieldChange);

    // Research question input change to clear error
    if (elements.questionInput) {
      elements.questionInput.addEventListener('input', () => {
        if (elements.questionError) {
          elements.questionError.textContent = '';
          elements.questionError.hidden = true;
        }
        elements.questionInput.classList.remove('input-has-error');
      });
    }

    // 2. Add source button
    elements.addSourceBtn.addEventListener('click', handleAddSource);

    // 3. Sample questions
    elements.sampleChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        handleSampleClick(chip.dataset.sample);
      });
    });

    // 4. Sample demo button (Step 4 offline demo)
    if (elements.sampleDemoBtn) {
      elements.sampleDemoBtn.addEventListener('click', handleSampleDemo);
    }

    // 5. Form submission
    elements.form.addEventListener('submit', handleFormSubmit);

    // 6. Back to query button
    elements.backToInputBtn.addEventListener('click', handleBackToInput);

    // 7. Global citation button clicks to open Evidence Drawer
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action="open-drawer"]');
      if (btn) {
        const sourceId = btn.dataset.sourceId;
        const quote = btn.dataset.quote || null;
        const status = btn.dataset.status || 'verified';
        openEvidenceDrawer(sourceId, quote, status);
      }
    });

    // 8. Drawer dismissal
    elements.drawerCloseBtn.addEventListener('click', closeEvidenceDrawer);
    elements.drawerBackdrop.addEventListener('click', closeEvidenceDrawer);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !elements.drawer.hasAttribute('hidden')) {
        closeEvidenceDrawer();
      }
    });

    // 9. Checklist interactivity
    elements.checklistContainer.addEventListener('change', handleChecklistChange);
    elements.copyChecklistBtn.addEventListener('click', handleCopyChecklist);
    elements.downloadChecklistBtn.addEventListener('click', handleDownloadChecklist);
  }

  // Initial boot
  function init() {
    renderSources();
    initEventListeners();
  }

  // Execute immediately if DOM elements exist, or on DOMContentLoaded
  if (document.getElementById('analysis-form')) {
    init();
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
