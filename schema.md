-- Supabase Database Schema for Isotope Mass Analysis

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table 1: Analysis Sessions
-- Stores metadata about each analysis run
CREATE TABLE analysis_sessions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    sample_filename TEXT NOT NULL,
    background_filename TEXT NOT NULL,
    confidence_threshold REAL NOT NULL CHECK (confidence_threshold > 0 AND confidence_threshold <= 1),
    analysis_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table 2: Analysis Plots
-- Stores base64-encoded plots generated during analysis
CREATE TABLE analysis_plots (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    analysis_id UUID NOT NULL REFERENCES analysis_sessions(id) ON DELETE CASCADE,
    plot_type TEXT NOT NULL CHECK (plot_type IN ('spectrum_overview', 'mass_distribution', 'uncertainty_analysis', 'roi_plot')),
    plot_title TEXT NOT NULL,
    plot_data_base64 TEXT NOT NULL, -- Base64 encoded image data
    plot_metadata JSONB DEFAULT '{}', -- Additional plot information (format, dpi, isotope info for ROI plots, etc.)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table 3: Isotope Detections
-- Stores individual gamma peak detections for each isotope
CREATE TABLE isotope_detections (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    analysis_id UUID NOT NULL REFERENCES analysis_sessions(id) ON DELETE CASCADE,
    parent_isotope TEXT NOT NULL,
    daughter_isotope TEXT NOT NULL,
    gamma_energy_kev REAL NOT NULL CHECK (gamma_energy_kev > 0),
    detected_counts REAL NOT NULL CHECK (detected_counts >= 0),
    count_uncertainty REAL NOT NULL CHECK (count_uncertainty >= 0),
    relative_uncertainty REAL CHECK (relative_uncertainty >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Composite index for efficient queries
    UNIQUE(analysis_id, parent_isotope, daughter_isotope, gamma_energy_kev)
);

-- Table 4: Mass Estimates
-- Stores calculated mass estimates for parent isotopes
CREATE TABLE mass_estimates (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    analysis_id UUID NOT NULL REFERENCES analysis_sessions(id) ON DELETE CASCADE,
    parent_isotope TEXT NOT NULL,
    estimated_mass_g REAL NOT NULL CHECK (estimated_mass_g >= 0),
    mass_uncertainty_g REAL NOT NULL CHECK (mass_uncertainty_g >= 0),
    relative_mass_uncertainty REAL CHECK (relative_mass_uncertainty >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure one mass estimate per isotope per analysis
    UNIQUE(analysis_id, parent_isotope)
);

-- Table 5: Analysis Summary
-- Stores aggregate statistics for each analysis
CREATE TABLE analysis_summary (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    analysis_id UUID NOT NULL REFERENCES analysis_sessions(id) ON DELETE CASCADE,
    total_estimated_mass_g REAL NOT NULL CHECK (total_estimated_mass_g >= 0),
    total_detections INTEGER NOT NULL CHECK (total_detections >= 0),
    unique_parent_isotopes INTEGER NOT NULL CHECK (unique_parent_isotopes >= 0),
    dominant_isotope TEXT,
    mass_distribution JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- One summary per analysis
    UNIQUE(analysis_id)
);

-- Indexes for better query performance
CREATE INDEX idx_analysis_plots_analysis_id ON analysis_plots(analysis_id);
CREATE INDEX idx_analysis_plots_type ON analysis_plots(plot_type);
CREATE INDEX idx_isotope_detections_analysis_id ON isotope_detections(analysis_id);
CREATE INDEX idx_isotope_detections_parent_isotope ON isotope_detections(parent_isotope);
CREATE INDEX idx_isotope_detections_energy ON isotope_detections(gamma_energy_kev);
CREATE INDEX idx_mass_estimates_analysis_id ON mass_estimates(analysis_id);
CREATE INDEX idx_mass_estimates_isotope ON mass_estimates(parent_isotope);
CREATE INDEX idx_analysis_sessions_timestamp ON analysis_sessions(analysis_timestamp);

-- Row Level Security (RLS) policies
-- Enable RLS on all tables

-- Functions for data validation and triggers

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at
CREATE TRIGGER update_analysis_sessions_updated_at 
    BEFORE UPDATE ON analysis_sessions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to validate isotope detection data
CREATE OR REPLACE FUNCTION validate_isotope_detection()
RETURNS TRIGGER AS $$
BEGIN
    -- Check that relative uncertainty is calculated correctly
    IF NEW.detected_counts > 0 THEN
        NEW.relative_uncertainty = NEW.count_uncertainty / NEW.detected_counts;
    ELSE
        NEW.relative_uncertainty = NULL;
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for isotope detection validation
CREATE TRIGGER validate_isotope_detection_trigger
    BEFORE INSERT OR UPDATE ON isotope_detections
    FOR EACH ROW EXECUTE FUNCTION validate_isotope_detection();

-- Function to validate mass estimate data
CREATE OR REPLACE FUNCTION validate_mass_estimate()
RETURNS TRIGGER AS $$
BEGIN
    -- Check that relative mass uncertainty is calculated correctly
    IF NEW.estimated_mass_g > 0 THEN
        NEW.relative_mass_uncertainty = NEW.mass_uncertainty_g / NEW.estimated_mass_g;
    ELSE
        NEW.relative_mass_uncertainty = NULL;
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for mass estimate validation
CREATE TRIGGER validate_mass_estimate_trigger
    BEFORE INSERT OR UPDATE ON mass_estimates
    FOR EACH ROW EXECUTE FUNCTION validate_mass_estimate();

-- Views for common queries

-- View: Latest analysis results with plot counts
CREATE VIEW latest_analyses AS
SELECT 
    s.id,
    s.sample_filename,
    s.analysis_timestamp,
    s.confidence_threshold,
    sum.total_estimated_mass_g,
    sum.total_detections,
    sum.unique_parent_isotopes,
    sum.dominant_isotope,
    COUNT(p.id) as total_plots,
    COUNT(CASE WHEN p.plot_type = 'roi_plot' THEN 1 END) as roi_plots_count
FROM analysis_sessions s
LEFT JOIN analysis_summary sum ON s.id = sum.analysis_id
LEFT JOIN analysis_plots p ON s.id = p.analysis_id
GROUP BY s.id, s.sample_filename, s.analysis_timestamp, s.confidence_threshold,
         sum.total_estimated_mass_g, sum.total_detections, sum.unique_parent_isotopes, sum.dominant_isotope
ORDER BY s.analysis_timestamp DESC;

-- View: Detailed detection results
CREATE VIEW detection_results AS
SELECT 
    s.sample_filename,
    s.analysis_timestamp,
    d.parent_isotope,
    d.daughter_isotope,
    d.gamma_energy_kev,
    d.detected_counts,
    d.count_uncertainty,
    d.relative_uncertainty,
    m.estimated_mass_g,
    m.mass_uncertainty_g,
    m.relative_mass_uncertainty
FROM analysis_sessions s
JOIN isotope_detections d ON s.id = d.analysis_id
LEFT JOIN mass_estimates m ON s.id = m.analysis_id AND d.parent_isotope = m.parent_isotope
ORDER BY s.analysis_timestamp DESC, d.parent_isotope, d.gamma_energy_kev;

-- View: Mass comparison across analyses
CREATE VIEW mass_comparison AS
SELECT 
    s.sample_filename,
    s.analysis_timestamp,
    m.parent_isotope,
    m.estimated_mass_g,
    m.relative_mass_uncertainty,
    RANK() OVER (PARTITION BY m.parent_isotope ORDER BY m.estimated_mass_g DESC) as mass_rank
FROM analysis_sessions s
JOIN mass_estimates m ON s.id = m.analysis_id
ORDER BY m.parent_isotope, m.estimated_mass_g DESC;

-- View: Plot catalog for easy retrieval
CREATE VIEW plot_catalog AS
SELECT 
    s.sample_filename,
    s.analysis_timestamp,
    p.plot_type,
    p.plot_title,
    p.plot_metadata,
    p.created_at as plot_created_at,
    CASE 
        WHEN p.plot_type = 'roi_plot' THEN p.plot_metadata->>'parent_isotope'
        ELSE NULL
    END as parent_isotope,
    CASE 
        WHEN p.plot_type = 'roi_plot' THEN (p.plot_metadata->>'gamma_energy_kev')::REAL
        ELSE NULL
    END as gamma_energy_kev,
    LENGTH(p.plot_data_base64) as image_size_bytes
FROM analysis_sessions s
JOIN analysis_plots p ON s.id = p.analysis_id
ORDER BY s.analysis_timestamp DESC, p.plot_type, parent_isotope;

-- Function to retrieve plot data (useful for API endpoints)
CREATE OR REPLACE FUNCTION get_analysis_plots(analysis_session_id UUID)
RETURNS TABLE (
    plot_type TEXT,
    plot_title TEXT,
    plot_data_base64 TEXT,
    plot_metadata JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.plot_type,
        p.plot_title,
        p.plot_data_base64,
        p.plot_metadata
    FROM analysis_plots p
    WHERE p.analysis_id = analysis_session_id
    ORDER BY 
        CASE p.plot_type
            WHEN 'spectrum_overview' THEN 1
            WHEN 'mass_distribution' THEN 2
            WHEN 'uncertainty_analysis' THEN 3
            WHEN 'roi_plot' THEN 4
        END,
        (p.plot_metadata->>'gamma_energy_kev')::REAL NULLS LAST;
END;
$$ LANGUAGE plpgsql;