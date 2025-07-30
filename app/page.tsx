'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, BarChart3, Atom, FileText, Eye, TrendingUp } from 'lucide-react';
import Image from 'next/image';

// Types based on the database schema
interface PlotMetadata {
  parent_isotope?: string;
  gamma_energy_kev?: number;
  [key: string]: unknown;
}

interface IsotopeDetection {
  id: string;
  analysis_id: string;
  parent_isotope: string;
  daughter_isotope: string;
  gamma_energy_kev: number;
  detected_counts: number;
  count_uncertainty: number;
  relative_uncertainty: number;
}

interface MassEstimate {
  id: string;
  analysis_id: string;
  parent_isotope: string;
  estimated_mass_g: number;
  mass_uncertainty_g: number;
  relative_mass_uncertainty: number;
}

interface AnalysisPlot {
  id: string;
  analysis_id: string;
  plot_type: 'spectrum_overview' | 'mass_distribution' | 'uncertainty_analysis' | 'roi_plot';
  plot_title: string;
  plot_data_base64: string;
  plot_metadata: PlotMetadata;
}

interface LatestAnalysis {
  id: string;
  sample_filename: string;
  analysis_timestamp: string;
  confidence_threshold: number;
  total_estimated_mass_g: number;
  total_detections: number;
  unique_parent_isotopes: number;
  dominant_isotope: string;
  total_plots: number;
  roi_plots_count: number;
}

// Initialize Supabase client (you'll need to add your actual URL and anon key)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function AnalysisDashboard() {
  const [latestAnalyses, setLatestAnalyses] = useState<LatestAnalysis[]>([]);
  const [selectedAnalysis, setSelectedAnalysis] = useState<string | null>(null);
  const [detections, setDetections] = useState<IsotopeDetection[]>([]);
  const [massEstimates, setMassEstimates] = useState<MassEstimate[]>([]);
  const [plots, setPlots] = useState<AnalysisPlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    fetchLatestAnalyses();
  }, []);

  useEffect(() => {
    if (selectedAnalysis) {
      fetchAnalysisDetails(selectedAnalysis);
    }
  }, [selectedAnalysis]);

  const fetchLatestAnalyses = async () => {
    try {
      const { data, error } = await supabase
        .from('latest_analyses')
        .select('*')
        .limit(20);

      if (error) throw error;
      setLatestAnalyses(data || []);
      if (data && data.length > 0) {
        setSelectedAnalysis(data[0].id);
      }
    } catch (error) {
      console.error('Error fetching analyses:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAnalysisDetails = async (analysisId: string) => {
  try {
    console.log('=== Fetching details for analysis:', analysisId);
    
    // Fetch detections
    const { data: detectionsData, error: detectionsError } = await supabase
      .from('isotope_detections')
      .select('*')
      .eq('analysis_id', analysisId)
      .order('parent_isotope', { ascending: true });

    if (detectionsError) throw detectionsError;
    console.log(`Found ${detectionsData?.length || 0} detections:`, detectionsData);
    setDetections(detectionsData || []);

    // Fetch mass estimates
    const { data: massData, error: massError } = await supabase
      .from('mass_estimates')
      .select('*')
      .eq('analysis_id', analysisId)
      .order('estimated_mass_g', { ascending: false });

    if (massError) throw massError;
    console.log(`Found ${massData?.length || 0} mass estimates:`, massData);
    setMassEstimates(massData || []);

    // Fetch plots
    const { data: plotsData, error: plotsError } = await supabase
      .from('analysis_plots')
      .select('*')
      .eq('analysis_id', analysisId)
      .order('plot_type', { ascending: true });

    if (plotsError) throw plotsError;
    console.log(`Found ${plotsData?.length || 0} plots:`, plotsData?.map(p => ({
      type: p.plot_type,
      title: p.plot_title,
      hasData: !!p.plot_data_base64,
      dataLength: p.plot_data_base64?.length
    })));
    setPlots(plotsData || []);

  } catch (error) {
    console.error('Error fetching analysis details:', error);
  }
};

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatMass = (mass: number) => {
    if (mass < 0.001) return `${(mass * 1000000).toFixed(2)} μg`;
    if (mass < 1) return `${(mass * 1000).toFixed(2)} mg`;
    return `${mass.toFixed(3)} g`;
  };

  const getPlotTypeIcon = (plotType: string) => {
    switch (plotType) {
      case 'spectrum_overview': return <BarChart3 className="h-4 w-4" />;
      case 'mass_distribution': return <TrendingUp className="h-4 w-4" />;
      case 'uncertainty_analysis': return <Atom className="h-4 w-4" />;
      case 'roi_plot': return <Eye className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  const currentAnalysis = latestAnalyses.find(a => a.id === selectedAnalysis);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Isotope Mass Analysis Dashboard</h1>
        <Badge variant="outline" className="text-sm">
          {latestAnalyses.length} Total Analyses
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Analysis List Sidebar */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">Recent Analyses</CardTitle>
            <CardDescription>Click to view details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 max-h-96 overflow-y-auto">
            {latestAnalyses.map((analysis) => (
              <div
                key={analysis.id}
                className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedAnalysis === analysis.id 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setSelectedAnalysis(analysis.id)}
              >
                <div className="font-medium text-sm truncate">
                  {analysis.sample_filename}
                </div>
                <div className="text-xs text-gray-500 flex items-center mt-1">
                  <Calendar className="h-3 w-3 mr-1" />
                  {formatTimestamp(analysis.analysis_timestamp)}
                </div>
                <div className="flex justify-between items-center mt-2">
                  <Badge variant="secondary" className="text-xs">
                    {analysis.unique_parent_isotopes} isotopes
                  </Badge>
                  <span className="text-xs font-medium">
                    {formatMass(analysis.total_estimated_mass_g)}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Main Content Area */}
        <div className="lg:col-span-3 space-y-6">
          {currentAnalysis && (
            <>
              {/* Analysis Overview Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-2">
                      <Atom className="h-5 w-5 text-blue-600" />
                      <div>
                        <p className="text-sm font-medium">Total Mass</p>
                        <p className="text-2xl font-bold">
                          {formatMass(currentAnalysis.total_estimated_mass_g)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-2">
                      <BarChart3 className="h-5 w-5 text-green-600" />
                      <div>
                        <p className="text-sm font-medium">Detections</p>
                        <p className="text-2xl font-bold">{currentAnalysis.total_detections}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-2">
                      <TrendingUp className="h-5 w-5 text-purple-600" />
                      <div>
                        <p className="text-sm font-medium">Isotopes</p>
                        <p className="text-2xl font-bold">{currentAnalysis.unique_parent_isotopes}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-2">
                      <Eye className="h-5 w-5 text-orange-600" />
                      <div>
                        <p className="text-sm font-medium">Confidence</p>
                        <p className="text-2xl font-bold">
                          {(currentAnalysis.confidence_threshold * 100).toFixed(0)}%
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Analysis Details Tabs */}
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="detections">Detections</TabsTrigger>
                  <TabsTrigger value="masses">Mass Estimates</TabsTrigger>
                  <TabsTrigger value="plots">Plots</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Analysis Information</CardTitle>
                      <CardDescription>
                        Analysis performed on {formatTimestamp(currentAnalysis.analysis_timestamp)}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium text-gray-600">Sample File</label>
                          <p className="font-mono text-sm bg-gray-100 p-2 rounded">
                            {currentAnalysis.sample_filename}
                          </p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-600">Dominant Isotope</label>
                          <p className="font-semibold text-lg">
                            {currentAnalysis.dominant_isotope || 'N/A'}
                          </p>
                        </div>
                      </div>
                      
                      {currentAnalysis.dominant_isotope && massEstimates.length > 0 && (
                        <div>
                          <h4 className="font-medium mb-2">Mass Distribution</h4>
                          <div className="space-y-2">
                            {massEstimates.slice(0, 5).map((estimate) => {
                              const percentage = (estimate.estimated_mass_g / currentAnalysis.total_estimated_mass_g) * 100;
                              return (
                                <div key={estimate.id} className="flex items-center space-x-3">
                                  <span className="w-16 text-sm font-medium">{estimate.parent_isotope}</span>
                                  <div className="flex-1 bg-gray-200 rounded-full h-2">
                                    <div 
                                      className="bg-blue-600 h-2 rounded-full" 
                                      style={{ width: `${percentage}%` }}
                                    ></div>
                                  </div>
                                  <span className="text-sm text-gray-600">
                                    {formatMass(estimate.estimated_mass_g)} ({percentage.toFixed(1)}%)
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="detections" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Isotope Detections</CardTitle>
                      <CardDescription>
                        {detections.length} gamma peak detections found
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left p-2">Parent Isotope</th>
                              <th className="text-left p-2">Daughter Isotope</th>
                              <th className="text-left p-2">Energy (keV)</th>
                              <th className="text-left p-2">Counts</th>
                              <th className="text-left p-2">Uncertainty</th>
                              <th className="text-left p-2">Rel. Uncertainty</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detections.map((detection) => (
                              <tr key={detection.id} className="border-b hover:bg-gray-50">
                                <td className="p-2 font-medium">{detection.parent_isotope}</td>
                                <td className="p-2">{detection.daughter_isotope}</td>
                                <td className="p-2">{detection.gamma_energy_kev.toFixed(1)}</td>
                                <td className="p-2">{detection.detected_counts.toFixed(0)}</td>
                                <td className="p-2">±{detection.count_uncertainty.toFixed(1)}</td>
                                <td className="p-2">
                                  {detection.relative_uncertainty 
                                    ? `${(detection.relative_uncertainty * 100).toFixed(1)}%`
                                    : 'N/A'
                                  }
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="masses" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Mass Estimates</CardTitle>
                      <CardDescription>
                        Calculated mass estimates for {massEstimates.length} parent isotopes
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-4">
                        {massEstimates.map((estimate) => (
                          <div key={estimate.id} className="border rounded-lg p-4">
                            <div className="flex justify-between items-start">
                              <div>
                                <h4 className="font-semibold text-lg">{estimate.parent_isotope}</h4>
                                <p className="text-2xl font-bold text-blue-600">
                                  {formatMass(estimate.estimated_mass_g)}
                                </p>
                              </div>
                              <div className="text-right text-sm text-gray-600">
                                <p>Uncertainty: ±{formatMass(estimate.mass_uncertainty_g)}</p>
                                <p>
                                  Relative: {estimate.relative_mass_uncertainty 
                                    ? `${(estimate.relative_mass_uncertainty * 100).toFixed(2)}%`
                                    : 'N/A'
                                  }
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="plots" className="space-y-4">
                  <div className="grid gap-4">
                    {plots.map((plot) => (
                      <Card key={plot.id}>
                        <CardHeader>
                          <div className="flex items-center space-x-2">
                            {getPlotTypeIcon(plot.plot_type)}
                            <CardTitle className="text-lg">{plot.plot_title}</CardTitle>
                          </div>
                          <CardDescription>
                            {plot.plot_type.replace('_', ' ').toUpperCase()}
                            {plot.plot_type === 'roi_plot' && plot.plot_metadata?.parent_isotope && (
                              <span> - {plot.plot_metadata.parent_isotope} ({plot.plot_metadata.gamma_energy_kev} keV)</span>
                            )}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="w-full max-w-4xl mx-auto">
                            <Image
                              src={`data:image/png;base64,${plot.plot_data_base64}`}
                              alt={plot.plot_title}
                              width={800}
                              height={600}
                              className="w-full h-auto rounded-lg border"
                              unoptimized
                            />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
      </div>
    </div>
  );
}