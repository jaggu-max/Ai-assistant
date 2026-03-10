import React, { useState, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { 
  FileText, 
  Upload, 
  Send, 
  Loader2, 
  X, 
  Download,
  MessageSquare, 
  AlertCircle,
  ChevronRight,
  Search,
  Menu,
  Moon,
  Sun,
  User as UserIcon,
  LogOut,
  Plus,
  History,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import DeveloperCard from './components/DeveloperCard';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useParams, useNavigate } from 'react-router-dom';

import { extractTextFromPDF, getPageImage } from './services/pdfService';
import { queryPDF } from './services/geminiService';
import { PDFDocument, ChatMessage, QueryResult, Chat, UserProfile } from './types';
import { auth, db, signInWithGoogle, logout, handleFirestoreError, OperationType } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { 
  collection, 
  doc, 
  setDoc, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  serverTimestamp, 
  Timestamp,
  getDocs,
  deleteDoc
} from 'firebase/firestore';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  // Auth State
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // App State
  const [pdfDoc, setPdfDoc] = useState<PDFDocument | null>(null);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isQuerying, setIsQuerying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // UI State
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [chats, setChats] = useState<Chat[]>([]);
  const { chatId: currentChatId } = useParams<{ chatId: string }>();
  const navigate = useNavigate();
  const [activeResult, setActiveResult] = useState<QueryResult | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const pdfScrollRef = useRef<HTMLDivElement>(null);

  // Dark Mode Effect
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      setIsAuthLoading(false);
      
      if (user) {
        // Sync user profile to Firestore
        const userRef = doc(db, 'users', user.uid);
        await setDoc(userRef, {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          updatedAt: serverTimestamp()
        }, { merge: true });
      } else {
        setChats([]);
        navigate('/');
        setMessages([]);
        setPdfDoc(null);
        setOriginalFile(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch Chats
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'chats'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const chatList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Chat[];
      setChats(chatList);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'chats');
    });

    return () => unsubscribe();
  }, [user]);

  // Fetch Messages for Current Chat
  useEffect(() => {
    if (!currentChatId) return;

    const q = query(
      collection(db, 'chats', currentChatId, 'messages'),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ChatMessage[];
      setMessages(msgList);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, `chats/${currentChatId}/messages`);
    });

    return () => unsubscribe();
  }, [currentChatId]);

  // Scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isQuerying]);

  const onDrop = async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file || file.type !== 'application/pdf') {
      setError('Please upload a valid PDF file.');
      return;
    }

    setError(null);
    setIsExtracting(true);
    try {
      const doc = await extractTextFromPDF(file);
      
      const totalText = doc.pages.map(p => p.text).join('').trim();
      
      if (!totalText && doc.pages.length > 0) {
        setError('This PDF appears to be a scanned document or contains only images. I cannot extract text from it to answer your questions.');
        setIsExtracting(false);
        return;
      }

      if (doc.pages.length === 0) {
        setError('Failed to extract any content from the PDF. The file might be corrupted or protected.');
        setIsExtracting(false);
        return;
      }

      setPdfDoc(doc);
      setOriginalFile(file);

      const successMessage = doc.partialFailure 
        ? `Some parts of the document "${file.name}" could not be processed. The system will attempt to answer using the available content from ${doc.pages.length} pages.`
        : `Document "${file.name}" loaded successfully. I've extracted text from ${doc.pages.length} pages. You can now ask me questions about its content.`;

      // Create a new chat if user is logged in
      if (user) {
        const chatRef = await addDoc(collection(db, 'chats'), {
          userId: user.uid,
          pdfName: file.name,
          createdAt: serverTimestamp(),
          lastMessage: 'Document uploaded'
        });
        navigate(`/${chatRef.id}`);
        
        // Add initial message
        await addDoc(collection(db, 'chats', chatRef.id, 'messages'), {
          role: 'assistant',
          content: successMessage,
          createdAt: serverTimestamp()
        });
      } else {
        // Guest mode
        setMessages([{
          role: 'assistant',
          content: successMessage
        }]);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to process PDF. Please try a different file.');
    } finally {
      setIsExtracting(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    multiple: false
  } as any);

  const scrollToPage = (pageNumber: number | string, result?: QueryResult) => {
    if (!pageNumber || pageNumber === 'N/A') return;
    if (result) setActiveResult(result);
    const element = document.getElementById(`pdf-page-${pageNumber}`);
    if (element && pdfScrollRef.current) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleSend = async () => {
    if (!inputValue.trim() || !pdfDoc || !originalFile || isQuerying) return;

    const question = inputValue.trim();
    setInputValue('');
    
    if (!user) {
      // Guest mode
      setMessages(prev => [...prev, { role: 'user', content: question }]);
    } else if (currentChatId) {
      // Save user message to Firestore
      await addDoc(collection(db, 'chats', currentChatId, 'messages'), {
        role: 'user',
        content: question,
        createdAt: serverTimestamp()
      });
      
      // Update chat last message
      await setDoc(doc(db, 'chats', currentChatId), {
        lastMessage: question
      }, { merge: true });
    }

    setIsQuerying(true);

    try {
      const result = await queryPDF(pdfDoc, question, originalFile);
      setActiveResult(result);
      
      if (!user) {
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: result.answer,
          result 
        }]);
      } else if (currentChatId) {
        // Save assistant response to Firestore
        await addDoc(collection(db, 'chats', currentChatId, 'messages'), {
          role: 'assistant',
          content: result.answer,
          result,
          createdAt: serverTimestamp()
        });
      }

      // Auto-scroll to page if found
      if (result.pageNumber && result.pageNumber !== 'N/A') {
        setTimeout(() => scrollToPage(result.pageNumber, result), 500);
      }
    } catch (err) {
      const errorMsg = 'Sorry, I encountered an error while processing your request.';
      if (!user) {
        setMessages(prev => [...prev, { role: 'assistant', content: errorMsg }]);
      } else if (currentChatId) {
        await addDoc(collection(db, 'chats', currentChatId, 'messages'), {
          role: 'assistant',
          content: errorMsg,
          createdAt: serverTimestamp()
        });
      }
    } finally {
      setIsQuerying(false);
    }
  };

  const handleNewChat = () => {
    setPdfDoc(null);
    setOriginalFile(null);
    setMessages([]);
    navigate('/');
    setError(null);
  };

  const selectChat = async (chat: Chat) => {
    navigate(`/${chat.id}`);
    // Note: In a real app, we'd need to re-upload or store the PDF text/file
    // For this demo, we'll just clear the PDF state if it doesn't match
    if (pdfDoc?.name !== chat.pdfName) {
      setPdfDoc(null);
      setOriginalFile(null);
      setError('Please re-upload the PDF to continue this chat.');
    }
  };

  const deleteChat = async (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'chats', chatId));
      if (currentChatId === chatId) {
        handleNewChat();
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `chats/${chatId}`);
    }
  };

  const handleDownload = () => {
    if (!originalFile) return;
    const url = URL.createObjectURL(originalFile);
    const a = document.createElement('a');
    a.href = url;
    a.download = originalFile.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (isAuthLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--text-primary)]" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] font-sans overflow-hidden">
      
      {/* Sidebar */}
      <AnimatePresence mode="wait">
        {isSidebarOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 260, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="h-full bg-[var(--bg-secondary)] border-r border-[var(--border-color)] flex flex-col flex-shrink-0"
          >
            <div className="p-4">
              <button 
                onClick={handleNewChat}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-lg border border-[var(--border-color)] hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                New Chat
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-2 space-y-1">
              <div className="px-3 py-2 text-[10px] uppercase tracking-widest text-[var(--text-secondary)] font-bold">
                History
              </div>
              {chats.length === 0 ? (
                <div className="px-3 py-4 text-xs text-[var(--text-secondary)] italic text-center">
                  No chat history yet
                </div>
              ) : (
                chats.map(chat => (
                  <div 
                    key={chat.id}
                    onClick={() => selectChat(chat)}
                    className={cn(
                      "sidebar-item group",
                      currentChatId === chat.id && "sidebar-item-active"
                    )}
                  >
                    <MessageSquare className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate flex-1">{chat.pdfName}</span>
                    <button 
                      onClick={(e) => deleteChat(e, chat.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/10 rounded transition-all"
                    >
                      <X className="w-3 h-3 text-red-500" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="p-4 border-t border-[var(--border-color)]">
              {!user ? (
                <button 
                  onClick={signInWithGoogle}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-black text-white dark:bg-white dark:text-black hover:opacity-90 transition-all text-sm font-medium"
                >
                  <UserIcon className="w-4 h-4" />
                  Sign in with Google
                </button>
              ) : (
                <div className="flex items-center gap-3 px-2">
                  <img src={user.photoURL || ''} alt="" className="w-8 h-8 rounded-full border border-[var(--border-color)]" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{user.displayName}</p>
                    <button onClick={logout} className="text-[10px] text-red-500 hover:underline flex items-center gap-1">
                      <LogOut className="w-3 h-3" />
                      Sign out
                    </button>
                  </div>
                </div>
              )}

              <DeveloperCard />
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        
        {/* Navbar */}
        <nav className="h-14 border-b border-[var(--border-color)] flex items-center justify-between px-4 bg-[var(--bg-primary)] z-10">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors"
            >
              {isSidebarOpen ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeftOpen className="w-5 h-5" />}
            </button>
            <h1 className="text-lg font-semibold tracking-tight hidden sm:block">AI PDF Query Assistant</h1>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors"
            >
              {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            {user && (
              <div className="w-8 h-8 rounded-full overflow-hidden border border-[var(--border-color)]">
                <img src={user.photoURL || ''} alt="" className="w-full h-full object-cover" />
              </div>
            )}
          </div>
        </nav>

        {/* Content Split */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* PDF Viewer Area */}
          <div className="flex-1 flex flex-col bg-[var(--bg-secondary)] overflow-hidden">
            {!pdfDoc ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8">
                <div 
                  {...getRootProps()} 
                  className={cn(
                    "w-full max-w-md aspect-[3/4] rounded-3xl border-2 border-dashed flex flex-col items-center justify-center gap-4 cursor-pointer transition-all",
                    isDragActive ? "border-black dark:border-white bg-black/5 dark:bg-white/5" : "border-[var(--border-color)] hover:border-[var(--text-secondary)] hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
                  )}
                >
                  <input {...getInputProps()} />
                  <div className="w-16 h-16 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center">
                    {isExtracting ? (
                      <Loader2 className="w-8 h-8 animate-spin" />
                    ) : (
                      <Upload className="w-8 h-8" />
                    )}
                  </div>
                  <div className="text-center">
                    <p className="font-medium">{isExtracting ? "Processing PDF..." : "Upload PDF to start"}</p>
                    <p className="text-sm text-[var(--text-secondary)] mt-1">Drag & drop or click to browse</p>
                  </div>
                </div>
                {error && (
                  <div className="mt-6 flex items-center gap-2 text-red-500 text-sm bg-red-500/10 px-4 py-2 rounded-full">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="px-6 py-3 border-b border-[var(--border-color)] bg-[var(--bg-primary)] flex items-center justify-between">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <FileText className="w-4 h-4 text-[var(--text-secondary)]" />
                    <span className="text-sm font-medium truncate">{pdfDoc.name}</span>
                  </div>
                  <button onClick={handleDownload} className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors">
                    <Download className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-8 flex justify-center bg-[#525659] scroll-smooth" ref={pdfScrollRef}>
                   {/* Placeholder for PDF Viewer - in a real app we'd render the full PDF here */}
                   <div className="w-full max-w-3xl space-y-4">
                      {pdfDoc.pages.map(page => (
                        <div 
                          key={page.pageNumber} 
                          id={`pdf-page-${page.pageNumber}`}
                          className="w-full bg-white shadow-lg rounded-sm min-h-[800px] p-12 text-[#1a1a1a] relative group overflow-hidden"
                        >
                          {/* Highlight Overlay */}
                          {activeResult?.pageNumber === page.pageNumber && activeResult.boundingBox && (
                            <motion.div 
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="absolute border-2 border-yellow-400 bg-yellow-400/20 z-10 pointer-events-none rounded shadow-[0_0_20px_rgba(250,204,21,0.4)]"
                              style={{
                                top: `${activeResult.boundingBox.ymin / 10}%`,
                                left: `${activeResult.boundingBox.xmin / 10}%`,
                                width: `${(activeResult.boundingBox.xmax - activeResult.boundingBox.xmin) / 10}%`,
                                height: `${(activeResult.boundingBox.ymax - activeResult.boundingBox.ymin) / 10}%`,
                              }}
                            />
                          )}

                          <div className="absolute top-4 right-4 text-[10px] text-gray-300 font-mono">PAGE {page.pageNumber}</div>
                          <h3 className="text-lg font-bold mb-6 text-gray-400 border-b border-gray-100 pb-2">{pdfDoc.name}</h3>
                          <div className="space-y-4">
                            <p className="text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">{page.text}</p>
                          </div>
                        </div>
                      ))}
                   </div>
                </div>
              </div>
            )}
          </div>

          {/* Chat Panel (Right/Bottom depending on screen) */}
          <div className="w-[400px] border-l border-[var(--border-color)] flex flex-col bg-[var(--bg-primary)]">
            <div className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth" ref={scrollRef}>
              {messages.length === 0 && !isQuerying && (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-black/5 dark:bg-white/5 flex items-center justify-center">
                    <MessageSquare className="w-6 h-6 text-[var(--text-secondary)]" />
                  </div>
                  <div>
                    <p className="font-medium">No messages yet</p>
                    <p className="text-xs text-[var(--text-secondary)]">Upload a PDF and ask a question to begin.</p>
                  </div>
                </div>
              )}

              <AnimatePresence initial={false}>
                {messages.map((msg, i) => (
                  <motion.div
                    key={msg.id || i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "flex flex-col gap-2",
                      msg.role === 'user' ? "items-end" : "items-start"
                    )}
                  >
                    {msg.role === 'user' ? (
                      <div className="chat-bubble-user">
                        {msg.content}
                      </div>
                    ) : (
                      <div className="chat-bubble-assistant space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-6 h-6 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center">
                            <FileText className="w-3 h-3" />
                          </div>
                          <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">Assistant</span>
                        </div>
                        
                        {msg.result ? (
                          <div className="space-y-6">
                            <section>
                              <button 
                                onClick={() => scrollToPage(msg.result!.pageNumber, msg.result)}
                                className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)] mb-1 hover:text-[var(--text-primary)] transition-colors flex items-center gap-1"
                              >
                                📍 Page {msg.result.pageNumber}
                                <ChevronRight className="w-3 h-3" />
                              </button>
                            </section>

                            {msg.result.pageImage && (
                              <section>
                                <div className="rounded-xl overflow-hidden border border-[var(--border-color)] shadow-sm bg-white dark:bg-black">
                                  <img 
                                    src={msg.result.pageImage} 
                                    alt="Diagram" 
                                    className="w-full h-auto max-h-[300px] object-contain"
                                    referrerPolicy="no-referrer"
                                  />
                                </div>
                              </section>
                            )}

                            <section>
                              <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)] mb-1">📄 Answer Text</div>
                              <div className="text-sm leading-relaxed border-l-2 border-[var(--text-primary)] pl-3 py-1 italic opacity-80">
                                "{msg.result.answer}"
                              </div>
                            </section>

                            <section>
                              <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)] mb-1">🧠 Explanation</div>
                              <div className="text-sm leading-relaxed opacity-90">
                                {msg.result.explanation}
                              </div>
                            </section>
                          </div>
                        ) : (
                          <div className="text-sm leading-relaxed">
                            {msg.content}
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>

              {isQuerying && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-3 text-[var(--text-secondary)]"
                >
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-xs italic">Searching document...</span>
                </motion.div>
              )}
            </div>

            {/* Input */}
            <div className="p-4 border-t border-[var(--border-color)]">
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder={pdfDoc ? "Ask a question..." : "Upload a PDF first"}
                  disabled={!pdfDoc || isQuerying}
                  className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl py-3 pl-4 pr-12 text-sm focus:ring-1 focus:ring-[var(--text-primary)] transition-all disabled:opacity-50"
                />
                <button
                  onClick={handleSend}
                  disabled={!inputValue.trim() || !pdfDoc || isQuerying}
                  className="absolute right-2 p-2 bg-[var(--text-primary)] text-[var(--bg-primary)] rounded-lg disabled:opacity-20 transition-all hover:scale-105 active:scale-95"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <div className="mt-2 text-center">
                <p className="text-[10px] text-[var(--text-secondary)] opacity-50">
                  Developed by <span className="font-semibold">Abhishek Halasagi</span> • AI PDF Assistant
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
