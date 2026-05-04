import React, { useRef, useState } from 'react';
import { Upload, AlertCircle } from 'lucide-react';
import clsx from 'clsx';

interface UploaderProps {
    onUpload: (file: File) => void;
}

export const Uploader: React.FC<UploaderProps> = ({ onUpload }) => {
    const [isDragOver, setIsDragOver] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(true);
    };

    const handleDragLeave = () => {
        setIsDragOver(false);
    };

    const validateAndUpload = (file: File) => {
        setError(null);
        const validTypes = ['audio/mpeg', 'audio/wav', 'audio/x-m4a', 'audio/mp4', 'audio/webm', 'audio/ogg'];
        // Basic check, might vary by browser
        if (file.type && !validTypes.some(t => file.type.includes(t.split('/')[1]))) {
            // Just warn, but maybe let it pass if unsure? No, strict MVP.
            // Actually 'audio/*' is broad.
        }

        if (file.size > 25 * 1024 * 1024) {
            setError('File size exceeds 25MB limit.');
            return;
        }

        onUpload(file);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);

        const file = e.dataTransfer.files[0];
        if (file) {
            validateAndUpload(file);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            validateAndUpload(file);
        }
    };

    return (
        <div
            className={clsx(
                "flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-xl transition-colors cursor-pointer w-full",
                isDragOver ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:border-brand-300 hover:bg-slate-50"
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
        >
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept="audio/*"
                className="hidden"
            />

            <div className="bg-slate-100 p-4 rounded-full mb-4">
                <Upload className="w-8 h-8 text-slate-500" />
            </div>

            <h3 className="text-lg font-medium text-slate-700 mb-2">Upload Audio File</h3>
            <p className="text-sm text-slate-500 text-center max-w-xs">
                Drag and drop MP3, WAV, or M4A here, or click to browse.
            </p>

            {error && (
                <div className="mt-4 flex items-center text-red-500 text-sm bg-red-50 px-3 py-2 rounded-lg">
                    <AlertCircle className="w-4 h-4 mr-2" />
                    {error}
                </div>
            )}
        </div>
    );
};
