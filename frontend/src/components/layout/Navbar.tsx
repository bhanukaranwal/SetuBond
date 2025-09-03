'use client';

import React from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import { Bell, User, LogOut, Menu } from 'lucide-react';
import { Button } from '../ui/Button';

export const Navbar: React.FC = () => {
  const { user, isAuthenticated, logout } = useAuthStore();

  const handleLogout = () => {
    logout();
  };

  return (
    <nav className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link href="/" className="flex items-center">
              <span className="text-2xl font-bold text-blue-600">SetuBond</span>
            </Link>
            
            {isAuthenticated && (
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                <Link
                  href="/dashboard"
                  className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                >
                  Dashboard
                </Link>
                <Link
                  href="/trading"
                  className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                >
                  Trading
                </Link>
                <Link
                  href="/portfolio"
                  className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                >
                  Portfolio
                </Link>
                <Link
                  href="/analytics"
                  className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                >
                  Analytics
                </Link>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-4">
            {isAuthenticated ? (
              <>
                <button className="p-2 rounded-full text-gray-400 hover:text-gray-500">
                  <Bell className="h-5 w-5" />
                </button>
                
                <div className="flex items-center space-x-3">
                  <div className="flex flex-col text-right">
                    <span className="text-sm font-medium text-gray-900">
                      {user?.profile?.firstName} {user?.profile?.lastName}
                    </span>
                    <span className="text-xs text-gray-500 capitalize">
                      {user?.role?.toLowerCase()}
                    </span>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <button className="p-1 rounded-full text-gray-400 hover:text-gray-500">
                      <User className="h-5 w-5" />
                    </button>
                    <button
                      onClick={handleLogout}
                      className="p-1 rounded-full text-gray-400 hover:text-gray-500"
                    >
                      <LogOut className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center space-x-4">
                <Link href="/login">
                  <Button variant="ghost">Sign In</Button>
                </Link>
                <Link href="/register">
                  <Button>Get Started</Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};
