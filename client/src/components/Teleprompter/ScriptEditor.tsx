import React, { useState } from 'react';
import { Save, FolderOpen, Trash2, FileText, Check } from 'lucide-react';

interface ScriptEditorProps {
    value: string;
    onChange: (val: string) => void;
    onSwitchToPrompter: () => void;
}

const SAMPLE_SCRIPT = `Welcome to Voxplain!

This is a sample script to demonstrate the teleprompter feature. 
Notice how the text is easy to read.

You can paste your own presentation notes here.
Adjust the speed and font size to match your speaking style.

Remember to breathe, pause for emphasis, and make eye contact with the camera.
Good luck with your recording!`;

export const ScriptEditor: React.FC<ScriptEditorProps> = ({ value, onChange, onSwitchToPrompter }) => {
    const [savedMessage, setSavedMessage] = useState<string | null>(null);

    const handleSave = () => {
        localStorage.setItem('voxplain_saved_script', value);
        setSavedMessage("Saved locally!");
        setTimeout(() => setSavedMessage(null), 2000);
    };

    const handleLoad = () => {
        const saved = localStorage.getItem('voxplain_saved_script');
        if (saved) {
            onChange(saved);
            setSavedMessage("Loaded script!");
            setTimeout(() => setSavedMessage(null), 2000);
        } else {
            alert("No saved script found.");
        }
    };

    const handleClear = () => {
        if (confirm("Are you sure you want to clear the script?")) {
            onChange('');
        }
    };

    const handleSample = () => {
        onChange(SAMPLE_SCRIPT);
    };

    const wordCount = value.trim().split(/\s+/).filter(Boolean).length;
    const charCount = value.length;
    const estTime = Math.ceil(wordCount / 130); // ~130 wpm

    return (
        <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
                <div className="flex items-center space-x-2">
                    <button onClick={handleSave} className="p-2 text-slate-600 hover:text-brand-600 hover:bg-white rounded-lg transition-all" title="Save to LocalStorage">
                        <Save className="w-5 h-5" />
                    </button>
                    <button onClick={handleLoad} className="p-2 text-slate-600 hover:text-brand-600 hover:bg-white rounded-lg transition-all" title="Load from LocalStorage">
                        <FolderOpen className="w-5 h-5" />
                    </button>
                    <button onClick={handleClear} className="p-2 text-slate-600 hover:text-red-600 hover:bg-white rounded-lg transition-all" title="Clear">
                        <Trash2 className="w-5 h-5" />
                    </button>
                    <div className="h-6 w-px bg-slate-300 mx-2" />
                    <button onClick={handleSample} className="text-xs font-medium text-brand-600 hover:text-brand-700 px-3 py-1.5 bg-brand-50 rounded-md transition-colors">
                        Use Sample
                    </button>
                </div>
                {savedMessage && (
                    <span className="text-xs text-green-600 font-medium flex items-center animate-fade-in-out">
                        <Check className="w-3 h-3 mr-1" /> {savedMessage}
                    </span>
                )}
            </div>

            {/* Editor Area */}
            <div className="flex-1 relative">
                <textarea
                    className="w-full h-full p-6 resize-none focus:outline-none focus:ring-2 focus:ring-brand-500/20 text-slate-700 text-lg leading-relaxed"
                    placeholder="Paste or type your script here..."
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                />
            </div>

            {/* Footer Stats / Action */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                <div className="text-xs text-slate-500 space-x-3">
                    <span>{wordCount} words</span>
                    <span>{charCount} chars</span>
                    <span>~{estTime} min read</span>
                </div>

                <button
                    onClick={onSwitchToPrompter}
                    disabled={wordCount === 0}
                    className="flex items-center space-x-2 px-5 py-2 bg-slate-900 text-white rounded-full text-sm font-medium hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                    <FileText className="w-4 h-4" />
                    <span>Open Teleprompter</span>
                </button>
            </div>
        </div>
    );
};
