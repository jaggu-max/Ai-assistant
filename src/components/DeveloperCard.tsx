import React from 'react';
import { Instagram, Github, Mail, ExternalLink } from 'lucide-react';
import { motion } from 'motion/react';

const DeveloperCard: React.FC = () => {
  return (
    <div className="mt-4 p-4 rounded-xl bg-white/50 dark:bg-white/5 border border-[var(--border-color)] shadow-sm backdrop-blur-sm">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-purple-500 to-orange-500 flex items-center justify-center text-white font-bold text-lg shadow-inner">
          AH
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)] font-bold">Developer</div>
          <div className="text-sm font-semibold">Abhishek Halasagi</div>
        </div>
      </div>
      
      <div className="flex items-center gap-2 mb-4">
        <div className="relative group">
          <motion.a
            href="https://instagram.com/_mr__abhi__10"
            target="_blank"
            rel="noopener noreferrer"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="p-2 rounded-lg bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-600 text-white flex items-center justify-center shadow-sm"
          >
            <Instagram className="w-4 h-4" />
          </motion.a>
          
          {/* Tooltip */}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
            @_mr__abhi__10
          </div>
        </div>

        <div className="relative group">
          <motion.div
            whileHover={{ scale: 1.1 }}
            className="p-2 rounded-lg bg-gray-200 dark:bg-gray-800 text-[var(--text-secondary)] flex items-center justify-center cursor-not-allowed opacity-50"
          >
            <Github className="w-4 h-4" />
          </motion.div>
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
            Coming Soon
          </div>
        </div>
      </div>

      <button 
        onClick={() => window.location.href = 'mailto:abhishekabhi18228@gmail.com'}
        className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-[var(--text-primary)] text-[var(--bg-primary)] text-xs font-medium hover:opacity-90 transition-all active:scale-[0.98]"
      >
        <Mail className="w-3 h-3" />
        Contact Developer
      </button>
      
      <div className="mt-3 pt-3 border-t border-[var(--border-color)] flex items-center justify-between text-[9px] text-[var(--text-secondary)] uppercase tracking-tighter font-medium">
        <span>Developed by Abhishek Halasagi</span>
        <ExternalLink className="w-2 h-2" />
      </div>
    </div>
  );
};

export default DeveloperCard;
