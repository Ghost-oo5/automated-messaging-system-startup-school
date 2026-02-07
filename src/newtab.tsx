import { useState, useEffect } from "react"
import "./style.css"
import { getProfiles, getMessageHistory } from "~/utils/storage"

function IndexNewtab() {
  const [profilesCount, setProfilesCount] = useState(0)
  const [messagesCount, setMessagesCount] = useState(0)

  useEffect(() => {
    getProfiles().then(p => setProfilesCount(p.length))
    getMessageHistory().then(m => setMessagesCount(m.length))
  }, [])

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-sans text-slate-900 p-8">
      <div className="max-w-4xl w-full text-center space-y-12">
        <header className="space-y-4">
          <div className="mx-auto w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center text-white shadow-2xl shadow-indigo-200 animate-in zoom-in duration-500">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
          </div>
          <h1 className="text-5xl font-black tracking-tighter text-slate-800">
            Automated <span className="text-indigo-600">Messaging</span> System
          </h1>
          <p className="text-xl text-slate-500 font-medium max-w-2xl mx-auto">
            Your professional orchestration engine for YC Startup School networking and prospect discovery.
          </p>
        </header>

        <main className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
          <div className="card p-8 group hover:border-indigo-200 transition-all cursor-default">
            <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
            </div>
            <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-1">Database Stats</h3>
            <p className="text-4xl font-black text-slate-800 tracking-tight">{profilesCount} Profiles</p>
          </div>

          <div className="card p-8 group hover:border-emerald-200 transition-all cursor-default">
            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            </div>
            <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-1">Engagement</h3>
            <p className="text-4xl font-black text-slate-800 tracking-tight">{messagesCount} Messages</p>
          </div>
        </main>

        <footer className="pt-20">
          <div className="inline-flex items-center gap-6 text-sm font-bold text-slate-400 uppercase tracking-[0.2em]">
            <span>Secure</span>
            <span className="w-1 h-1 bg-slate-300 rounded-full" />
            <span>Local Only</span>
            <span className="w-1 h-1 bg-slate-300 rounded-full" />
            <span>AI Powered</span>
          </div>
        </footer>
      </div>
    </div>
  )
}

export default IndexNewtab
