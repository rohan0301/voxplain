import { useState, useEffect, useMemo } from 'react';
import { Mic, FolderOpen, Clock, Calendar, Target, Zap, AlertTriangle, BookOpen, Activity, X, Download, Trash2, Plus, Music } from 'lucide-react';

import { Uploader } from './components/Uploader';
import { Report } from './components/Report';
import { WritingStudioPage } from './pages/WritingStudioPage';
import { TeleprompterPage } from './pages/TeleprompterPage';
import { transcribeAudio, analyzeTechnicality, saveRecording, listRecordings, deleteRecording } from './api';
import type { TranscriptionResult, TechnicalityResult, SavedRecording } from './api';
import { VideoRecorderModal } from './components/VideoRecorder/VideoRecorderModal';
import { PracticeResults } from './components/VideoRecorder/PracticeResults';
import type { PracticeAnalysisResult } from './types/PracticeResult';
import { TopNav } from './components/TopNav';
import { LandingHero } from './components/LandingHero';
import { ProjectsView } from './components/ProjectsView';
import type { Project } from './types/Project';
import { CreateProjectModal } from './components/CreateProjectModal';
import { EditProjectModal } from './components/EditProjectModal';
import { LabelButtons } from './components/LabelButtons';

const PROJECTS_STORAGE_PREFIX = 'voxplain_projects:';
const LOCAL_PROJECTS_STORAGE_KEY = `${PROJECTS_STORAGE_PREFIX}local`;

const formatProjectDate = (date: Date) =>
  date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const getProjectsStorageKey = () => LOCAL_PROJECTS_STORAGE_KEY;

const reviveProjects = (rawProjects: Project[]): Project[] =>
  rawProjects.map(project => ({
    ...project,
    lastModifiedDateObj: new Date(project.lastModifiedDateObj),
  }));

const loadLocalProjects = (): Project[] => {
  const rawProjects = localStorage.getItem(getProjectsStorageKey());
  if (!rawProjects) return [];

  try {
    return reviveProjects(JSON.parse(rawProjects) as Project[]);
  } catch (err) {
    console.warn('Failed to load saved projects', err);
    return [];
  }
};

const createProjectId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `p-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const formatRecordingTimestamp = (isoDate: string) =>
  new Date(isoDate).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

const estimateSpeechTime = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) return 0;

  const wordCount = trimmed.split(/\s+/).length;
  return Math.floor((wordCount / 130) * 60);
};

function App() {
  const [report, setReport] = useState<TranscriptionResult | null>(null);
  const [technicalityResult, setTechnicalityResult] = useState<TechnicalityResult | null>(null);
  const [showMoreLabels, setShowMoreLabels] = useState(false);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [practiceResult, setPracticeResult] = useState<PracticeAnalysisResult | null>(null);
  const [savedRecordings, setSavedRecordings] = useState<SavedRecording[]>([]);
  const [selectedRecordingId, setSelectedRecordingId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Projects State
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [lastOpenedProjectId, setLastOpenedProjectId] = useState<string | null>(null);
  const [projectsLoadedForUserId, setProjectsLoadedForUserId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  // Mode/View State
  // Combined view state: 'home' | 'projects' | 'transcribe' | 'practice' | 'analyze'
  const [currentView, setCurrentView] = useState<'home' | 'projects' | 'transcribe' | 'practice' | 'analyze'>('home');

  // Video Recorder State
  const [showVideoRecorder, setShowVideoRecorder] = useState(false);

  // Shared Script State
  const [script, setScript] = useState('');
  const [practiceView, setPracticeView] = useState<'studio' | 'teleprompter'>('studio');

  const handleLogoClick = () => {
    setCurrentView('home');
  };

  // Enhanced Navigation Handler
  const handleNavigation = (targetView: string) => {
    // If target is projects, just go there
    if (targetView === 'projects') {
      setCurrentView('projects');
      return;
    }

    // If target is a feature view (transcribe, practice)
    // Check if we have a selected project
    if (!selectedProjectId) {
      // If no selection, check last opened
      if (lastOpenedProjectId) {
        setSelectedProjectId(lastOpenedProjectId);
        setCurrentView(targetView as any);
      } else {
        // Default to first project
        if (projects.length > 0) {
          const defaultProject = projects[0];
          setSelectedProjectId(defaultProject.id);
          setLastOpenedProjectId(defaultProject.id);
          setCurrentView(targetView as any);
        } else {
          // Fallback if no projects exist (edge case)
          setCurrentView(targetView as any);
        }
      }
    } else {
      // We have a selection, just go there
      setCurrentView(targetView as any);
    }
  };

  const handleProjectSelect = (projectId: string) => {
    setSelectedProjectId(projectId);
    setLastOpenedProjectId(projectId);
    // "Clicking a row ... navigates to the Transcribe view"
    setCurrentView('transcribe');

    // Load project data into global context/script if needed?
    // Ideally we should have a `useEffect` that updates `script` when `selectedProjectId` changes.
    // For now, let's just find it and set it manually.
    const proj = projects.find(p => p.id === projectId);
    if (proj) {
      setScript(proj.speechText || '');
    }
  };

  const handleCreateProject = (projectData: Partial<Project>) => {
    const now = new Date();
    const newProject: Project = {
      id: createProjectId(),
      name: projectData.name || 'Untitled Project',
      lastModified: formatProjectDate(now),
      lastModifiedDateObj: now,
      estimatedTimeSec: projectData.estimatedTimeSec || 0,
      requiredTimeSec: projectData.requiredTimeSec,
      audience: projectData.audience,
      presentationType: projectData.presentationType,
      speechText: projectData.speechText,
      audienceLevel: projectData.audienceLevel,
      domain: projectData.domain
    };

    setProjects([newProject, ...projects]);
    setShowCreateModal(false);

    // Select the new project and go to writing studio? Or just select it?
    // Let's select it and go to studio as that's typical "Create" flow
    setSelectedProjectId(newProject.id);
    setLastOpenedProjectId(newProject.id);
    setScript(newProject.speechText || '');
    // If they provided text, maybe analyze?
    // Go to modify/writing studio
    // But logic says Projects view -> Transcribe. Let's stick to user flow or intuitive flow.
    // Let's just go to 'projects' list update (which we are on) or open it.
    // We'll stay on projects view but it's at top.
  };

  const handleEditProject = (project: Project) => {
    setEditingProject(project);
    // We do NOT navigate. Just open modal.
  };

  const handleUpdateProject = (projectId: string, updates: Partial<Project>) => {
    const now = new Date();
    setProjects(prev => prev.map(p => {
      if (p.id !== projectId) return p;
      return {
        ...p,
        ...updates,
        lastModified: formatProjectDate(now),
        lastModifiedDateObj: now
      };
    }));
    setEditingProject(null);
  };

  // Recordings live in this browser's IndexedDB — see lib/recordingStore.ts.
  // A storage failure must not lose the analysis the user just waited for, so
  // it degrades to an in-memory entry and a warning.
  const persistRecording = async (file: File, result: TranscriptionResult) => {
    try {
      const saved = await saveRecording({
        file,
        report: result,
        projectId: selectedProjectId,
        projectName: activeProject?.name ?? 'Untitled Session',
      });
      setSavedRecordings(prev => [saved, ...prev]);
      setSelectedRecordingId(saved.id);
    } catch (err) {
      console.error('[Recordings] Could not save to this device:', err);
      setStorageWarning("Couldn't save this recording to your device — download it if you want to keep it.");
    }
  };

  const handleFile = async (file: File) => {
    setIsProcessing(true);
    setError(null);
    setReport(null);
    setPracticeResult(null);
    setSelectedRecordingId(null);
    setCurrentView('transcribe');

    try {
      const result = await transcribeAudio(file);
      setReport(result);
      await persistRecording(file, result);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to process audio.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleVideoAnalyze = async (file: File) => {
    setShowVideoRecorder(false);
    setIsProcessing(true);
    setError(null);
    setReport(null);
    setPracticeResult(null);
    setSelectedRecordingId(null);
    setCurrentView('transcribe');

    try {
      const transcription = await transcribeAudio(file);
      setReport(transcription);
      setPracticeResult({ speech: transcription });
      await persistRecording(file, transcription);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to process recording.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setReport(null);
    setPracticeResult(null);
    setError(null);
    setSelectedRecordingId(null);
  };

  const handleDeleteRecording = () => {
    if (!selectedRecordingId) {
      handleReset();
      return;
    }

    const id = selectedRecordingId;
    setSavedRecordings(prev => prev.filter(recording => recording.id !== id));
    deleteRecording(id).catch(err =>
      console.error('[Recordings] Could not delete from this device:', err)
    );
    handleReset();
  };

  const handleStartNewSession = () => {
    handleReset();
    setShowVideoRecorder(true);
  };

  const handleOpenSavedRecording = (recording: SavedRecording) => {
    setReport(recording.report);
    setPracticeResult({ speech: recording.report });
    setTechnicalityResult(null);
    setSelectedRecordingId(recording.id);
    setCurrentView('transcribe');
  };

  const handleDownloadSavedRecording = (recording: SavedRecording) => {
    if (!recording.audioUrl) return;
    const a = document.createElement('a');
    a.href = recording.audioUrl;
    a.download = recording.fileName || `voxplain-recording-${recording.recordedAt}.webm`;
    a.click();
  };

  // Helper utils for time display
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // Helper to get active project object
  const activeProject = projects.find(p => p.id === selectedProjectId);
  const activeSavedRecording = savedRecordings.find(recording => recording.id === selectedRecordingId) ?? null;
  const visibleRecordings = savedRecordings.filter(recording => !selectedProjectId || recording.projectId === selectedProjectId);

  // Sentences from the transcript that the analyzer did NOT flag, offered for
  // confirmation so the label set isn't drawn only from flagged text.
  const nonHotspotSentences = useMemo(() => {
    if (!report?.text || !technicalityResult) return [];
    const flagged = new Set(technicalityResult.hotspots.map(h => h.sentence.trim()));
    return (report.text.match(/[^.!?]+[.!?]+/g) || [])
      .map(s => s.trim())
      .filter(s => s.length > 20 && !flagged.has(s));
  }, [report?.text, technicalityResult]);

  const handleAnalyze = async () => {
    if (!report?.text) return;

    setIsProcessing(true);
    try {
      const res = await analyzeTechnicality({
        transcriptText: report.text,
        words: report.words?.map(word => ({
          text: word.text,
          startSec: word.start,
          endSec: word.end,
        })),
        audienceLevel: activeProject?.audienceLevel,
        requiredTimeSec: activeProject?.requiredTimeSec,
        domain: activeProject?.domain
      });
      setTechnicalityResult(res.technicality);
    } catch (err) {
      console.error(err);
      setError("Analysis failed. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };


  // Helper to determine layout mode
  const isWorkspaceView = currentView === 'practice';

  useEffect(() => {
    const localProjects = loadLocalProjects();
    setProjects(localProjects);
    setSelectedProjectId(null);
    setLastOpenedProjectId(localProjects[0]?.id ?? null);
    setProjectsLoadedForUserId('local');
    setSelectedRecordingId(null);
    setScript('');

    // Recordings persist on this device between visits.
    listRecordings()
      .then(setSavedRecordings)
      .catch(err => {
        console.error('[Recordings] Could not read from this device:', err);
        setSavedRecordings([]);
      });
  }, []);

  useEffect(() => {
    if (projectsLoadedForUserId !== 'local') return;
    localStorage.setItem(getProjectsStorageKey(), JSON.stringify(projects));
  }, [projects, projectsLoadedForUserId]);

  useEffect(() => {
    if (!selectedProjectId || currentView !== 'practice') return;

    setProjects(prev => prev.map(project => {
      if (project.id !== selectedProjectId || project.speechText === script) return project;

      return {
        ...project,
        speechText: script,
        estimatedTimeSec: estimateSpeechTime(script),
      };
    }));
  }, [currentView, script, selectedProjectId]);

  // --- RENDER LANDING PAGE (HOME) ---
  if (currentView === 'home') {
    return (
      <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-brand-100 selection:text-brand-900 pt-16">
        <TopNav
          currentMode={currentView === 'home' ? '' : currentView}
          onModeChange={() => { }} // Disabled on home
          onLogoClick={handleLogoClick}
        />
        <LandingHero
          onGetStarted={() => {
            setCurrentView('projects');
          }}
        />
      </div>
    );
  }

  // --- APP WORKSPACE ---
  return (
    <div className={isWorkspaceView
      ? "h-screen overflow-hidden bg-slate-50 font-sans text-slate-900 selection:bg-brand-100 selection:text-brand-900 flex flex-col"
      : "min-h-screen bg-slate-50 font-sans text-slate-900 pb-20 selection:bg-brand-100 selection:text-brand-900"
    }>

      {/* 1. Top Navigation */}
      <TopNav
        currentMode={currentView}
        onModeChange={handleNavigation}
        onLogoClick={handleLogoClick}
      />

      {/* Main Content Container */}
      <main className={isWorkspaceView
        ? "flex-1 flex flex-col min-h-0 pt-24 pb-4 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full"
        : "max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 animate-fade-in-up"
      }>
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between animate-fade-in shrink-0">
            <div className="flex items-center text-red-700">
              <AlertTriangle className="w-5 h-5 mr-2" />
              <span className="font-medium">{error}</span>
            </div>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* PROJECTS VIEW */}
        {currentView === 'projects' && (
          <ProjectsView
            projects={projects}
            selectedProjectId={selectedProjectId}
            onSelectProject={handleProjectSelect}
            onCreateProject={() => setShowCreateModal(true)}
            onEditProject={handleEditProject}
          />
        )}

        {/* FEATURE VIEWS (Transcribe, Practice, Analyze) */}
        {currentView !== 'projects' && (
          <div className={isWorkspaceView ? "flex-1 flex flex-col min-h-0 space-y-6" : "space-y-6"}>

            {/* Project Context Header */}
            {activeProject ? (
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 text-sm text-slate-500 pb-4 border-b border-slate-200">
                <div className="flex items-center gap-2 font-medium text-slate-900 bg-white px-3 py-1 rounded-full shadow-sm border border-slate-200">
                  <FolderOpen className="w-4 h-4 text-brand-600" />
                  {activeProject.name}
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Edited</span> {activeProject.lastModified}
                  </div>

                  {/* Time Status Logic */}
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5" />

                    {activeProject.requiredTimeSec ? (
                      // Has Target
                      <span className={
                        activeProject.estimatedTimeSec > activeProject.requiredTimeSec
                          ? "text-red-600 font-medium"
                          : "text-slate-600"
                      }>
                        {formatTime(activeProject.estimatedTimeSec)} / {formatTime(activeProject.requiredTimeSec)}
                        {activeProject.estimatedTimeSec > activeProject.requiredTimeSec && (
                          <span className="ml-2 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-bold">OVER</span>
                        )}
                      </span>
                    ) : (
                      // No Target
                      <span>~{formatTime(activeProject.estimatedTimeSec)}</span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-400 pb-4 border-b border-slate-200">Select a project</div>
            )}


            {/* TRANSCRIBE VIEW */}
            {currentView === 'transcribe' && (
              <div className="bg-white rounded-2xl p-6 md:p-10 border border-slate-200 min-h-[600px] shadow-sm">
                {/* Core Transcription Logic - Reused */}
                <div className="space-y-12">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-slate-800">Transcription Workspace</h2>
                      <p className="text-slate-500 text-sm">Upload or record to generate a detailed report.</p>
                    </div>
                    {(report || practiceResult) && (
                      <div className="flex items-center gap-2">
                        <button onClick={handleDeleteRecording} className="inline-flex items-center gap-2 text-sm font-medium text-red-500 hover:text-red-600 border border-red-100 bg-red-50 rounded-lg px-3 py-1.5">
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </button>
                        <button onClick={handleStartNewSession} className="inline-flex items-center gap-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg px-3 py-1.5">
                          <Plus className="w-4 h-4" />
                          Start New Session
                        </button>
                      </div>
                    )}
                  </div>

                  {!practiceResult && !report && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div
                        onClick={() => setShowVideoRecorder(true)}
                        className="group relative bg-gradient-to-br from-brand-50 to-white rounded-2xl border border-brand-100 p-8 cursor-pointer hover:shadow-lg hover:shadow-brand-100/50 hover:-translate-y-1 transition-all duration-300"
                      >
                        <div className="absolute top-4 right-4 bg-brand-100 text-brand-700 text-xs font-bold px-2 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">NEW</div>
                        <div className="bg-brand-600 w-12 h-12 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-brand-200 group-hover:scale-110 transition-transform">
                          <Mic className="text-white w-6 h-6" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 mb-2">Record Session</h3>
                        <p className="text-slate-500 leading-relaxed">
                          Use your camera and microphone.
                        </p>
                      </div>

                      <div className="bg-slate-50 rounded-2xl border border-slate-200 p-8 flex flex-col justify-center h-full">
                        <div className="mb-4">
                          <h3 className="text-xl font-bold text-slate-900 mb-1">Upload File</h3>
                          <p className="text-slate-500 text-sm">Supports .mp3, .wav, .mp4</p>
                        </div>
                        <Uploader onUpload={handleFile} />
                      </div>
                    </div>
                  )}

                  {isProcessing && (
                    <div className="text-center py-20">
                      <div className="animate-spin w-12 h-12 border-4 border-brand-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                      <p className="text-slate-600 font-medium">Processing...</p>
                    </div>
                  )}

                  {practiceResult && !report && !isProcessing && (
                    <PracticeResults data={practiceResult} onReset={handleReset} />
                  )}

                  {report && !isProcessing && (
                    <Report
                      data={report}
                      audioSrc={activeSavedRecording?.audioUrl ?? undefined}
                      recordedAt={activeSavedRecording?.recordedAt}
                      onDownloadAudio={activeSavedRecording ? () => handleDownloadSavedRecording(activeSavedRecording) : undefined}
                    />
                  )}

                  <div className="border-t border-slate-100 pt-8">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Previous Recordings</h3>
                        <p className="text-xs text-slate-500">
                          Saved on this device only — clearing your browser data removes them. Download anything you want to keep.
                        </p>
                      </div>
                      <span className="text-xs font-semibold text-slate-400">{visibleRecordings.length} saved</span>
                    </div>

                    {storageWarning && (
                      <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex items-start justify-between gap-3">
                        <span>{storageWarning}</span>
                        <button onClick={() => setStorageWarning(null)} className="shrink-0 text-amber-600 hover:text-amber-900">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    {visibleRecordings.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                        Your saved recordings will appear here after you record a session.
                      </div>
                    ) : (
                      <div className="grid gap-3">
                        {visibleRecordings.map(recording => (
                          <button
                            key={recording.id}
                            onClick={() => handleOpenSavedRecording(recording)}
                            className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-brand-200 hover:bg-brand-50/30 transition-colors"
                          >
                            <div className="flex items-center justify-between gap-4">
                              <div className="min-w-0 flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
                                  <Music className="w-5 h-5" />
                                </div>
                                <div className="min-w-0">
                                  <div className="font-semibold text-slate-900 truncate">{recording.projectName}</div>
                                  <div className="text-xs text-slate-500">{formatRecordingTimestamp(recording.recordedAt)}</div>
                                </div>
                              </div>
                              <span className="text-xs font-semibold text-brand-600 shrink-0">Open analysis</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* PRACTICE VIEW */}
            {currentView === 'practice' && (
              <div className={isWorkspaceView
                ? "bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-6 md:p-8 flex-1 min-h-0 flex flex-col"
                : "bg-white rounded-2xl min-h-[600px] border border-slate-200 shadow-sm overflow-hidden p-6 md:p-8"
              }>
                {/* Writing Studio / Teleprompter Wrapper */}
                <div className="h-full flex-1 min-h-0">
                  {practiceView === 'studio' ? (
                    <WritingStudioPage
                      script={script}
                      setScript={setScript}
                      onSwitchToPrompter={() => setPracticeView('teleprompter')}
                      audienceLevel={activeProject?.audienceLevel}
                      domain={activeProject?.domain}
                      projectId={activeProject?.id}
                      projectName={activeProject?.name}
                    />
                  ) : (
                    <TeleprompterPage
                      script={script}
                      onBackToStudio={() => setPracticeView('studio')}
                      onRecordingComplete={handleFile}
                    />
                  )}
                </div>
              </div>
            )}

            {/* ANALYZE VIEW */}
            {currentView === 'analyze' && (
              <div className="space-y-6 animate-fade-in">

                {/* Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                      <Activity className="w-5 h-5 text-brand-600" />
                      Audience Impact & Technicality
                    </h2>
                    <p className="text-slate-500 text-sm">Analyze how well your content matches your audience.</p>
                  </div>
                  {activeProject?.audienceLevel !== undefined && (
                    <div className="px-3 py-1 bg-slate-100 rounded-full text-xs font-semibold text-slate-600 border border-slate-200">
                      Audience Level: {['Novice', 'Familiar', 'Strong', 'Expert'][activeProject.audienceLevel]}
                    </div>
                  )}
                </div>

                {activeSavedRecording && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col md:flex-row md:items-center gap-4 justify-between">
                    <div className="flex-1">
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Recording Playback</div>
                      <audio src={activeSavedRecording.audioUrl ?? undefined} controls className="w-full max-w-xl" />
                      <p className="text-xs text-slate-500 mt-2">Recorded {formatRecordingTimestamp(activeSavedRecording.recordedAt)}</p>
                    </div>
                    <button
                      onClick={() => handleDownloadSavedRecording(activeSavedRecording)}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Download className="w-4 h-4" />
                      Download Audio
                    </button>
                  </div>
                )}

                {!report?.text ? (
                  <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
                    <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Mic className="w-8 h-8 text-slate-300" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 mb-2">No Transcription Available</h3>
                    <p className="text-slate-500 mb-6 max-w-sm mx-auto">
                      You need to transcribe an audio or video file before running analysis.
                    </p>
                    <button
                      onClick={() => setCurrentView('transcribe')}
                      className="px-6 py-2 bg-brand-600 text-white font-medium rounded-xl hover:bg-brand-700 transition-colors"
                    >
                      Go to Transcribe
                    </button>
                  </div>
                ) : !technicalityResult ? (
                  <div className="bg-gradient-to-br from-brand-50 to-white rounded-2xl border border-brand-100 p-10 text-center shadow-sm">
                    <div className="bg-white w-16 h-16 rounded-2xl shadow-sm border border-brand-100 flex items-center justify-center mx-auto mb-6">
                      <Zap className="w-8 h-8 text-brand-500" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 mb-2">Ready to Analyze</h3>
                    <p className="text-slate-500 mb-8 max-w-md mx-auto">
                      Run our advanced technicality engine to detect jargon, evaluate complexity, and ensure audience fit.
                    </p>
                    <button
                      onClick={handleAnalyze}
                      disabled={isProcessing}
                      className="px-8 py-3 bg-brand-600 text-white font-bold rounded-xl hover:bg-brand-700 hover:shadow-lg hover:shadow-brand-500/20 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 mx-auto"
                    >
                      {isProcessing ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Analyzing...
                        </>
                      ) : (
                        <>
                          <Target className="w-4 h-4" />
                          Run Technical Analysis
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Top Stats Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {/* 1. Technical Load Score */}
                      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
                        <div className="flex justify-between items-start mb-4">
                          <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Technical Load</h4>
                          <Activity className="w-5 h-5 text-slate-300" />
                        </div>
                        <div className="flex items-baseline gap-2">
                          <span className="text-4xl font-bold text-slate-900">{technicalityResult.technicalLoadScore}</span>
                          <span className="text-sm text-slate-400">/ 100</span>
                        </div>
                        <div className="mt-2 h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${technicalityResult.technicalLoadScore > technicalityResult.audienceThreshold + 10 ? 'bg-red-500' : 'bg-green-500'}`}
                            style={{ width: `${technicalityResult.technicalLoadScore}%` }}
                          />
                        </div>
                        <p className="text-xs text-slate-400 mt-2">Target: &lt; {technicalityResult.audienceThreshold}</p>
                      </div>

                      {/* 2. Status Score */}
                      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-start mb-4">
                          <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Status</h4>
                          <Target className="w-5 h-5 text-slate-300" />
                        </div>
                        <div className={`text-2xl font-bold ${technicalityResult.status === 'above' ? 'text-red-600' :
                          technicalityResult.status === 'below' ? 'text-blue-600' : 'text-green-600'
                          } capitalize mb-1`}>
                          {technicalityResult.status === 'above' ? 'Too Technical' :
                            technicalityResult.status === 'below' ? 'Accessible' : 'On Target'}
                        </div>
                        <p className="text-sm text-slate-600 leading-relaxed">
                          {technicalityResult.summary}
                        </p>
                      </div>

                      {/* 3. Stats */}
                      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-start mb-4">
                          <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Jargon Stats</h4>
                          <BookOpen className="w-5 h-5 text-slate-300" />
                        </div>
                        <div className="space-y-3">
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-600">Total Terms Found</span>
                            <span className="font-medium text-slate-900">{technicalityResult.termStats.totalTerms}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-600">Max Cluster Size</span>
                            <span className="font-medium text-slate-900">{technicalityResult.termStats.maxClump}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-600">Explained Rate</span>
                            <span className={`font-medium ${technicalityResult.termStats.explainedRate < 0.3 ? 'text-red-600' : 'text-green-600'}`}>
                              {Math.round(technicalityResult.termStats.explainedRate * 100)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Hotspots Section */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                          <AlertTriangle className="w-5 h-5 text-orange-500" />
                          Improvement Hotspots
                        </h3>
                        <span className="text-xs font-medium text-slate-500 bg-white px-2 py-1 rounded border border-slate-200">
                          Top {technicalityResult.hotspots.length} Issues
                        </span>
                      </div>

                      <div className="divide-y divide-slate-100">
                        {technicalityResult.hotspots.length === 0 ? (
                          <div className="p-8 text-center text-slate-500 italic">
                            Great job! No major technicality hotspots detected.
                          </div>
                        ) : (
                          technicalityResult.hotspots.map((hotspot, idx) => (
                            <div key={idx} className="p-6">
                              <div className="flex gap-4 items-start">
                                <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-600 font-bold flex items-center justify-center shrink-0 text-sm">
                                  {idx + 1}
                                </div>
                                <div className="space-y-3 flex-1">
                                  <p className="text-slate-800 font-medium italic border-l-4 border-orange-200 pl-4 py-1 leading-relaxed">
                                    "{hotspot.sentence}"
                                  </p>

                                  <div className="flex flex-wrap gap-2 mt-2">
                                    {hotspot.terms.map(t => (
                                      <span key={t} className="px-2 py-1 bg-red-50 text-red-700 text-xs font-semibold rounded border border-red-100">
                                        {t}
                                      </span>
                                    ))}
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                                    <div>
                                      <h5 className="text-xs font-bold text-slate-500 uppercase mb-1">Issues</h5>
                                      <ul className="list-disc list-inside text-sm text-slate-600">
                                        {hotspot.reasons.map(r => <li key={r}>{r}</li>)}
                                      </ul>
                                    </div>
                                    <div>
                                      <h5 className="text-xs font-bold text-slate-500 uppercase mb-1">Suggestion</h5>
                                      <ul className="list-disc list-inside text-sm text-slate-600">
                                        {hotspot.suggestions.map(s => <li key={s}>{s}</li>)}
                                      </ul>
                                    </div>
                                  </div>

                                  <div className="pt-3 mt-1 border-t border-slate-100 flex justify-between items-center">
                                    <span className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">
                                      Was this actually confusing?
                                    </span>
                                    <LabelButtons
                                      sentence={hotspot.sentence.trim()}
                                      audienceLevel={activeProject?.audienceLevel}
                                      domain={activeProject?.domain}
                                      projectId={activeProject?.id}
                                      onSetAudience={() => setEditingProject(activeProject ?? null)}
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Confirming sentences we did NOT flag keeps the training set from
                        being a sample biased entirely toward flagged text. */}
                    {nonHotspotSentences.length > 0 && (
                      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <button
                          onClick={() => setShowMoreLabels(!showMoreLabels)}
                          className="w-full flex items-center justify-between px-6 py-4 bg-slate-50/50 hover:bg-slate-100 transition-colors text-left"
                        >
                          <span className="font-bold text-slate-800">Label more sentences</span>
                          <span className="text-xs text-slate-500">
                            {showMoreLabels ? 'Hide' : `${nonHotspotSentences.length} not flagged`}
                          </span>
                        </button>

                        {showMoreLabels && (
                          <div className="p-6 space-y-4 max-h-[400px] overflow-y-auto">
                            <p className="text-xs text-slate-500">
                              We didn't flag these. Tell us where we got it wrong — it's what trains the model.
                            </p>
                            {nonHotspotSentences.slice(0, 30).map((s, idx) => (
                              <div key={idx} className="pb-3 border-b border-slate-100 last:border-0 last:pb-0">
                                <p className="text-sm text-slate-700 mb-2 leading-relaxed">"{s}"</p>
                                <div className="flex justify-end">
                                  <LabelButtons
                                    sentence={s}
                                    audienceLevel={activeProject?.audienceLevel}
                                    domain={activeProject?.domain}
                                    projectId={activeProject?.id}
                                    onSetAudience={() => setEditingProject(activeProject ?? null)}
                                  />
                                </div>
                              </div>
                            ))}
                            {nonHotspotSentences.length > 30 && (
                              <p className="text-xs text-center text-slate-400 pt-2">
                                And {nonHotspotSentences.length - 30} more…
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                )}
              </div>
            )}

          </div>
        )}

        {/* MODALS */}
        {showVideoRecorder && (
          <VideoRecorderModal
            script={script}
            onClose={() => setShowVideoRecorder(false)}
            onAnalyze={handleVideoAnalyze}
          />
        )}

        {showCreateModal && (
          <CreateProjectModal
            onClose={() => setShowCreateModal(false)}
            onCreate={handleCreateProject}
          />
        )}

        {editingProject && (
          <EditProjectModal
            project={editingProject}
            onClose={() => setEditingProject(null)}
            onSave={handleUpdateProject}
          />
        )}
      </main>
    </div>
  );
}

export default App;
