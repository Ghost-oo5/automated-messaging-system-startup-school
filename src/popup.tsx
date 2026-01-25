import { useState } from "react"
import "./style.css"

function IndexPopup() {
  const [isActive, setIsActive] = useState(false)
  const [messageCount, setMessageCount] = useState(0)

  return (
    <div className="w-80 bg-gradient-to-br from-slate-50 to-slate-100 min-h-[500px]">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6 shadow-lg">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold">Automated Messaging</h1>
          <div className="relative">
            <button
              onClick={() => setIsActive(!isActive)}
              className={`w-14 h-7 rounded-full transition-all duration-300 ${
                isActive ? "bg-green-400" : "bg-gray-300"
              }`}>
              <span
                className={`block w-5 h-5 bg-white rounded-full shadow-md transform transition-transform duration-300 ${
                  isActive ? "translate-x-7" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>
        <p className="text-blue-100 text-sm">YCStartupSchool Extension</p>
      </div>

      {/* Stats Section */}
      <div className="p-6 space-y-4">
        <div className="bg-white rounded-xl shadow-md p-4 border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm font-medium">Messages Sent</p>
              <p className="text-3xl font-bold text-gray-800 mt-1">{messageCount}</p>
            </div>
            <div className="bg-blue-100 rounded-full p-4">
              <svg
                className="w-8 h-8 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
            </div>
          </div>
        </div>

        {/* Status Card */}
        <div
          className={`rounded-xl shadow-md p-4 border-2 transition-all duration-300 ${
            isActive
              ? "bg-green-50 border-green-200"
              : "bg-gray-50 border-gray-200"
          }`}>
          <div className="flex items-center space-x-3">
            <div
              className={`w-3 h-3 rounded-full ${
                isActive ? "bg-green-500 animate-pulse" : "bg-gray-400"
              }`}
            />
            <div>
              <p className="font-semibold text-gray-800">
                {isActive ? "System Active" : "System Inactive"}
              </p>
              <p className="text-sm text-gray-600">
                {isActive
                  ? "Automated messaging is running"
                  : "Click toggle to activate"}
              </p>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Quick Actions
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <button className="bg-white hover:bg-blue-50 border border-gray-200 hover:border-blue-300 rounded-lg p-4 transition-all duration-200 shadow-sm hover:shadow-md">
              <div className="flex flex-col items-center space-y-2">
                <div className="bg-indigo-100 rounded-full p-2">
                  <svg
                    className="w-5 h-5 text-indigo-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                </div>
                <span className="text-xs font-medium text-gray-700">New Message</span>
              </div>
            </button>
            <button className="bg-white hover:bg-blue-50 border border-gray-200 hover:border-blue-300 rounded-lg p-4 transition-all duration-200 shadow-sm hover:shadow-md">
              <div className="flex flex-col items-center space-y-2">
                <div className="bg-purple-100 rounded-full p-2">
                  <svg
                    className="w-5 h-5 text-purple-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                    />
                  </svg>
                </div>
                <span className="text-xs font-medium text-gray-700">Templates</span>
              </div>
            </button>
            <button className="bg-white hover:bg-blue-50 border border-gray-200 hover:border-blue-300 rounded-lg p-4 transition-all duration-200 shadow-sm hover:shadow-md">
              <div className="flex flex-col items-center space-y-2">
                <div className="bg-green-100 rounded-full p-2">
                  <svg
                    className="w-5 h-5 text-green-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    />
                  </svg>
                </div>
                <span className="text-xs font-medium text-gray-700">Analytics</span>
              </div>
            </button>
            <button className="bg-white hover:bg-blue-50 border border-gray-200 hover:border-blue-300 rounded-lg p-4 transition-all duration-200 shadow-sm hover:shadow-md">
              <div className="flex flex-col items-center space-y-2">
                <div className="bg-orange-100 rounded-full p-2">
                  <svg
                    className="w-5 h-5 text-orange-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                </div>
                <span className="text-xs font-medium text-gray-700">Settings</span>
              </div>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-gray-200 mt-6">
          <p className="text-xs text-gray-500 text-center">
            Automated Messaging System v0.0.1
          </p>
        </div>
      </div>
    </div>
  )
}

export default IndexPopup
