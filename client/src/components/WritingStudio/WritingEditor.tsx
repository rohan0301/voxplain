import React, { useState } from 'react';
import { Save, FolderOpen, Trash2, FileText, Check, Wand2 } from 'lucide-react';

interface WritingEditorProps {
    value: string;
    onChange: (val: string) => void;
    onAnalyze: () => void;
    onOpenPrompter: () => void;
    isAnalyzing?: boolean;
}

const SAMPLE_SCRIPT = `Welcome to the Voxplain Writing Studio!

This editor is designed to help you craft the perfect speech. As you type, notice the word count updates below.

Writing for the ear is different than writing for the eye. Keep your sentences relatively short. Use active verbs. Pause for emphasis.

When you're ready to practice, click "Analyze Text" to check your complexity, or jump straight into the Teleprompter to record your delivery.`;

export const WritingEditor: React.FC<WritingEditorProps> = ({ value, onChange, onAnalyze, onOpenPrompter, isAnalyzing = false }) => {
    const [savedMessage, setSavedMessage] = useState<string | null>(null);

    // Autosave debounced effect could be here, but parent might handle persistence. 
    // We'll add manual controls for clarity as per prompt.

    const handleSave = () => {
        localStorage.setItem('voxplain_saved_script', value);
        setSavedMessage("Saved to browser");
        setTimeout(() => setSavedMessage(null), 2000);
    };

    const handleLoad = () => {
        const saved = localStorage.getItem('voxplain_saved_script');
        if (saved) {
            onChange(saved);
            setSavedMessage("Loaded draft");
            setTimeout(() => setSavedMessage(null), 2000);
        }
    };

    const handleClear = () => {
        if (confirm("Clear current text?")) onChange('');
    };

    const handleSample = () => onChange(SAMPLE_SCRIPT);

    const wordCount = value.trim().split(/\s+/).filter(Boolean).length;
    // Estimate 130-160 WPM
    const minTime = Math.ceil(wordCount / 160);
    const maxTime = Math.ceil(wordCount / 130);
    const timeRange = minTime === maxTime ? `${minTime} min` : `${minTime}-${maxTime} min`;


    return (
        <div className="h-full flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden relative group min-h-0">

            {/* Toolbar */}
            <div className="flex items-center justify-between p-3 border-b border-slate-100 bg-white z-10 shrink-0">
                <div className="flex items-center space-x-1">
                    <button onClick={handleSave} className="p-2 text-slate-500 hover:text-brand-600 hover:bg-slate-50 rounded-lg transition-all" title="Save Draft">
                        <Save className="w-4 h-4" />
                    </button>
                    <button onClick={handleLoad} className="p-2 text-slate-500 hover:text-brand-600 hover:bg-slate-50 rounded-lg transition-all" title="Load Draft">
                        <FolderOpen className="w-4 h-4" />
                    </button>
                    <button onClick={handleClear} className="p-2 text-slate-500 hover:text-red-600 hover:bg-slate-50 rounded-lg transition-all" title="Clear">
                        <Trash2 className="w-4 h-4" />
                    </button>
                    <div className="h-5 w-px bg-slate-200 mx-2" />
                    <button onClick={handleSample} className="text-xs font-medium text-slate-500 hover:text-brand-600 px-3 py-1.5 rounded-md hover:bg-slate-50 transition-colors">
                        Load Sample
                    </button>
                </div>
                {savedMessage && (
                    <span className="text-xs text-green-600 font-medium flex items-center bg-green-50 px-2 py-1 rounded-full animate-fade-in-out">
                        <Check className="w-3 h-3 mr-1" /> {savedMessage}
                    </span>
                )}
            </div>

            {/* Editor */}
            <textarea
                className="flex-1 w-full p-8 resize-none focus:outline-none text-lg text-slate-800 leading-relaxed overflow-y-auto selection:bg-brand-100 min-h-0"
                placeholder="Start writing your speech here..."
                value={value}
                onChange={(e) => onChange(e.target.value)}
                spellCheck={true}
            />

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex flex-wrap gap-4 items-center justify-between shrink-0">
                <div className="text-xs font-medium text-slate-500 flex space-x-4">
                    <span>{wordCount} words</span>
                    <span>~{timeRange} speaking time</span>
                </div>

                <div className="flex items-center space-x-3">
                    <button
                        onClick={onAnalyze}
                        disabled={isAnalyzing}
                        className="text-slate-600 hover:text-brand-600 text-sm font-medium px-4 py-2 hover:bg-white rounded-lg transition-colors flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isAnalyzing ? (
                            <div className="w-4 h-4 mr-2 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                        ) : (
                            <Wand2 className="w-4 h-4 mr-2" />
                        )}
                        {isAnalyzing ? "Analyzing..." : "Analyze"}
                    </button>
                    <button
                        onClick={onOpenPrompter}
                        className="bg-slate-900 text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-slate-800 shadow-sm flex items-center transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={wordCount === 0}
                    >
                        <FileText className="w-4 h-4 mr-2" />
                        Teleprompter
                    </button>
                </div>
            </div>

        </div>
    );
};
