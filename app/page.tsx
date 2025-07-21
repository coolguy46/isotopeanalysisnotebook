"use client"

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Activity, BarChart3, FileText, Zap, Clock, TrendingUp } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

// TypeScript interface matching your Supabase schema
interface Analysis {
  id: number;
  analysis_id: string;
  timestamp: string;
  sample_name: string;
  detected_isotopes: Record<string, Record<string, { energy: string; intensity: string; half_life: string }>>;
  total_peaks_found: number;
  background_peaks: number;
  isotope_families_detected: string[];
  spectrum_data: Record<string, any>;
  plot_image?: string | null;
  analysis_parameters: Record<string, any>;
  status: string;
  created_at: string;
  updated_at: string;
}

interface Stats {
  totalAnalyses: number;
  completedAnalyses: number;
  totalIsotopes: number;
  uniqueIsotopes: number;
  isotopeFrequency: Record<string, number>;
  avgPeaks: number | string;
  recentAnalyses: Analysis[];
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://itpidwivlbrvpwjwxhaa.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0cGlkd2l2bGJydnB3and4aGFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI2OTM1MTAsImV4cCI6MjA2ODI2OTUxMH0.yfy6AcuMQKwhqD4lNcNMTgTJc52d36KRgytZZHcUcz8';
const supabase = createClient(supabaseUrl, supabaseKey);

const IsotopeDashboard = () => {
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalAnalyses: 0,
    completedAnalyses: 0,
    totalIsotopes: 0,
    uniqueIsotopes: 0,
    isotopeFrequency: {},
    avgPeaks: 0,
    recentAnalyses: []
  });
  const [loading, setLoading] = useState(true);
  const [selectedAnalysis, setSelectedAnalysis] = useState<Analysis | null>(null);
  const [refreshInterval, setRefreshInterval] = useState<NodeJS.Timeout | null>(null);

  // Fetch analyses from backend API
  const fetchAnalyses = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('isotope_analyses')
        .select('*')
        .order('timestamp', { ascending: false });
      if (error) throw error;
      // Patch missing fields for type safety
      const patched = (data as any[]).map((item) => ({
        spectrum_data: item.spectrum_data || {},
        analysis_parameters: item.analysis_parameters || {},
        created_at: item.created_at || item.timestamp || new Date().toISOString(),
        updated_at: item.updated_at || item.timestamp || new Date().toISOString(),
        plot_image: item.plot_image ?? null,
        ...item
      })) as Analysis[];
      setAnalyses(patched || []);
      calculateStats(patched || []);
    } catch (error) {
      console.error('Error fetching analyses:', error);
      setAnalyses([]);
      setStats({
        totalAnalyses: 0,
        completedAnalyses: 0,
        totalIsotopes: 0,
        uniqueIsotopes: 0,
        isotopeFrequency: {},
        avgPeaks: 0,
        recentAnalyses: []
      });
    } finally {
      setLoading(false);
    }
  };

  // Calculate statistics
  const calculateStats = (data: Analysis[]) => {
    const totalAnalyses = data.length;
    const completedAnalyses = data.filter((a: Analysis) => a.status === 'completed');
    const totalIsotopes = completedAnalyses.reduce((sum: number, a: Analysis) => sum + (a.isotope_families_detected?.length || 0), 0);
    
    // Isotope frequency
    const isotopeFreq: Record<string, number> = {};
    completedAnalyses.forEach((analysis: Analysis) => {
      (analysis.isotope_families_detected || []).forEach((isotope: string) => {
        isotopeFreq[isotope] = (isotopeFreq[isotope] || 0) + 1;
      });
    });

    const avgPeaks = completedAnalyses.length > 0 
      ? (completedAnalyses.reduce((sum: number, a: Analysis) => sum + (a.total_peaks_found || 0), 0) / completedAnalyses.length).toFixed(1)
      : 0;

    setStats({
      totalAnalyses,
      completedAnalyses: completedAnalyses.length,
      totalIsotopes,
      uniqueIsotopes: Object.keys(isotopeFreq).length,
      isotopeFrequency: isotopeFreq,
      avgPeaks,
      recentAnalyses: data.slice(0, 5)
    });
  };

  // Auto-refresh functionality
  const toggleAutoRefresh = () => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
      setRefreshInterval(null);
    } else {
      const interval = setInterval(fetchAnalyses, 30000) as NodeJS.Timeout;
      setRefreshInterval(interval);
    }
  };

  useEffect(() => {
    fetchAnalyses();
    return () => {
      if (refreshInterval) clearInterval(refreshInterval);
    };
  }, []);

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  interface StatCardProps {
    title: string;
    value: number | string;
    icon: React.ElementType;
    color?: string;
  }
  const StatCard = ({ title, value, icon: Icon, color = "blue" }: StatCardProps) => (
    <Card className="hover:shadow-lg transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">{title}</p>
            <p className={`text-2xl font-bold text-${color}-600`}>{value}</p>
          </div>
          <Icon className={`h-8 w-8 text-${color}-500`} />
        </div>
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading analysis data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Isotope Analysis Dashboard</h1>
              <p className="text-gray-600">Real-time gamma spectroscopy results</p>
            </div>
            <div className="flex space-x-4">
              <button
                onClick={fetchAnalyses}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors"
              >
                Refresh
              </button>
              <button
                onClick={toggleAutoRefresh}
                className={`px-4 py-2 rounded-md transition-colors ${
                  refreshInterval 
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                }`}
              >
                {refreshInterval ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard 
            title="Total Analyses" 
            value={stats.totalAnalyses || 0} 
            icon={FileText}
            color="blue"
          />
          <StatCard 
            title="Isotopes Detected" 
            value={stats.totalIsotopes || 0} 
            icon={Zap}
            color="green" 
          />
          <StatCard 
            title="Unique Isotopes" 
            value={stats.uniqueIsotopes || 0} 
            icon={BarChart3}
            color="purple"
          />
          <StatCard 
            title="Avg Peaks/Analysis" 
            value={stats.avgPeaks || 0} 
            icon={TrendingUp}
            color="orange"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Recent Analyses */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Clock className="h-5 w-5 mr-2" />
                  Recent Analyses
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {analyses.map((analysis) => (
                    <div 
                      key={analysis.analysis_id}
                      className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => setSelectedAnalysis(analysis)}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-semibold text-gray-900">{analysis.sample_name}</h3>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          analysis.status === 'completed' 
                            ? 'bg-green-100 text-green-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {analysis.status}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">
                        {formatTimestamp(analysis.timestamp)}
                      </p>
                      <div className="flex justify-between text-sm">
                        <span>Peaks: {analysis.total_peaks_found}</span>
                        <span>Isotopes: {analysis.isotope_families_detected?.length || 0}</span>
                      </div>
                      {analysis.isotope_families_detected?.length > 0 && (
                        <div className="mt-2">
                          <div className="flex flex-wrap gap-1">
                            {analysis.isotope_families_detected.map((isotope) => (
                              <span 
                                key={isotope}
                                className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs"
                              >
                                {isotope}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Isotope Frequency */}
          <div>
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Activity className="h-5 w-5 mr-2" />
                  Isotope Frequency
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {Object.entries(stats.isotopeFrequency || {})
                    .sort(([,a], [,b]) => b - a)
                    .map(([isotope, count]) => (
                      <div key={isotope} className="flex justify-between items-center">
                        <span className="font-medium">{isotope}</span>
                        <div className="flex items-center">
                          <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                            <div 
                              className="bg-blue-600 h-2 rounded-full" 
                              style={{
                                width: `${((count as number) / Math.max(...Object.values(stats.isotopeFrequency || {}) as number[])) * 100}%`
                              }}
                            ></div>
                          </div>
                          <span className="text-sm text-gray-600">{count as number}</span>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Analysis Detail Modal */}
        {selectedAnalysis && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">
                      {selectedAnalysis.sample_name}
                    </h2>
                    <p className="text-gray-600">
                      {formatTimestamp(selectedAnalysis.timestamp)}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedAnalysis(null)}
                    className="text-gray-400 hover:text-gray-600 text-xl"
                  >
                    ✕
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-3">Analysis Summary</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Status:</span>
                        <span className={`font-medium ${
                          selectedAnalysis.status === 'completed' ? 'text-green-600' : 'text-yellow-600'
                        }`}>
                          {selectedAnalysis.status}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Total Peaks:</span>
                        <span>{selectedAnalysis.total_peaks_found}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Background Peaks:</span>
                        <span>{selectedAnalysis.background_peaks}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Isotope Families:</span>
                        <span>{selectedAnalysis.isotope_families_detected?.length || 0}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold mb-3">Detected Isotopes</h3>
                    <div className="space-y-2">
                      {selectedAnalysis.isotope_families_detected?.map((isotope) => (
                        <div key={isotope} className="bg-blue-50 p-2 rounded">
                          <span className="font-medium text-blue-800">{isotope}</span>
                        </div>
                      )) || (
                        <p className="text-gray-500 italic">No isotopes detected</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Detailed Isotope Information */}
                {selectedAnalysis.detected_isotopes && Object.keys(selectedAnalysis.detected_isotopes).length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold mb-3">Isotope Details</h3>
                    <div className="overflow-x-auto">
                      <table className="min-w-full bg-white border border-gray-300">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                              Isotope
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                              Energy (keV)
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                              Intensity (%)
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                              Half-life
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {Object.entries(selectedAnalysis.detected_isotopes).map(([family, isotopes]) => 
                            Object.entries(isotopes as Record<string, { energy: string; intensity: string; half_life: string }>).map(([isotope, data]) => (
                              <tr key={`${family}-${isotope}`} className="hover:bg-gray-50">
                                <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900 border-b">
                                  {isotope}
                                </td>
                                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500 border-b">
                                  {data.energy}
                                </td>
                                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500 border-b">
                                  {data.intensity}
                                </td>
                                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500 border-b">
                                  {data.half_life}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Spectrum Plot */}
                {selectedAnalysis.plot_image && (
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold mb-3">Spectrum Plot</h3>
                    <div className="bg-gray-100 rounded-lg p-4 text-center">
                      <img 
                        src={
                          selectedAnalysis.plot_image.startsWith('data:image')
                            ? selectedAnalysis.plot_image
                            : `data:image/png;base64,${selectedAnalysis.plot_image}`
                        }
                        alt="Spectrum Plot"
                        className="max-w-full h-auto mx-auto"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          if (target.nextSibling && target.nextSibling instanceof HTMLElement) {
                            (target.nextSibling as HTMLElement).style.display = 'block';
                          }
                        }}
                      />
                      <div className="hidden text-gray-500 italic">
                        Plot image not available or failed to load
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    onClick={() => setSelectedAnalysis(null)}
                    className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-2 rounded-md transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default IsotopeDashboard;