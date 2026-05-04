import type { Project } from '../types/Project';
import { Clock, Calendar, ArrowRight, FolderOpen, Plus } from 'lucide-react';
import clsx from 'clsx';

interface ProjectsViewProps {
    projects: Project[];
    selectedProjectId: string | null;
    onSelectProject: (projectId: string) => void;
    onCreateProject: () => void;
    onEditProject: (project: Project) => void;
}

export const ProjectsView = ({ projects, selectedProjectId, onSelectProject, onCreateProject, onEditProject }: ProjectsViewProps) => {

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="space-y-8 animate-fade-in-up">

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <FolderOpen className="w-6 h-6 text-brand-600" />
                        Projects
                    </h2>
                    <p className="text-slate-500 mt-1">Select a project to continue working.</p>
                </div>

                <button
                    onClick={onCreateProject}
                    className="px-4 py-2 bg-brand-600 text-white rounded-xl font-semibold shadow-md shadow-brand-500/20 hover:bg-brand-700 hover:shadow-lg transition-all flex items-center gap-2 text-sm"
                >
                    <Plus className="w-4 h-4" />
                    Create Project
                </button>
            </div>

            {/* Projects Table Card */}
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-50/50 border-b border-slate-100 text-xs uppercase tracking-wider text-slate-500 font-semibold">
                            <th className="px-6 py-4">Name</th>
                            <th className="px-6 py-4">Date</th>
                            <th className="px-6 py-4">Time</th>
                            <th className="px-6 py-4 w-10"></th> {/* Spacer for Edit button */}
                            <th className="px-6 py-4 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {projects.map((project) => (
                            <tr
                                key={project.id}
                                onClick={() => onSelectProject(project.id)}
                                className={clsx(
                                    "cursor-pointer transition-all duration-200 group",
                                    selectedProjectId === project.id
                                        ? "bg-brand-50 hover:bg-brand-100/50"
                                        : "hover:bg-slate-50"
                                )}
                            >
                                <td className="px-6 py-4">
                                    <div className="font-medium text-slate-900 group-hover:text-brand-700 transition-colors">
                                        {project.name}
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-sm text-slate-500">
                                    <div className="flex items-center gap-2">
                                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                        {project.lastModified}
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-sm text-slate-500">
                                    <div className="flex items-center gap-2">
                                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                                        {formatTime(project.estimatedTimeSec)}
                                    </div>
                                </td>
                                <td className="px-2 py-4 text-center">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onEditProject(project);
                                        }}
                                        className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-semibold hover:bg-slate-200 transition-colors text-sm"
                                    >
                                        Edit
                                    </button>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <button className={clsx(
                                        "p-2 rounded-full transition-all opacity-0 group-hover:opacity-100",
                                        selectedProjectId === project.id
                                            ? "text-brand-600 bg-brand-100 opacity-100"
                                            : "text-slate-400 hover:text-brand-600 hover:bg-slate-100"
                                    )}>
                                        <ArrowRight className="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {projects.length === 0 && (
                    <div className="p-12 text-center text-slate-400">
                        No projects found.
                    </div>
                )}
            </div>
        </div>
    );
};
