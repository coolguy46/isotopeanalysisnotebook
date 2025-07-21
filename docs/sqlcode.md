-- Supabase Database Schema for Isotope Analysis Platform
-- Run this in your Supabase SQL editor

-- Create the main isotope_analyses table
CREATE TABLE IF NOT EXISTS public.isotope_analyses (
    id BIGSERIAL PRIMARY KEY,
    analysis_id UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sample_name TEXT NOT NULL,
    detected_isotopes JSONB NOT NULL DEFAULT '{}',
    total_peaks_found INTEGER NOT NULL DEFAULT 0,
    background_peaks INTEGER NOT NULL DEFAULT 0,
    isotope_families_detected TEXT[] NOT NULL DEFAULT '{}',
    spectrum_data JSONB NOT NULL DEFAULT '{}',
    plot_image TEXT, -- Base64 encoded image
    analysis_parameters JSONB NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_isotope_analyses_analysis_id ON public.isotope_analyses(analysis_id);
CREATE INDEX IF NOT EXISTS idx_isotope_analyses_timestamp ON public.isotope_analyses(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_isotope_analyses_sample_name ON public.isotope_analyses(sample_name);
CREATE INDEX IF NOT EXISTS idx_isotope_analyses_status ON public.isotope_analyses(status);
CREATE INDEX IF NOT EXISTS idx_isotope_analyses_created_at ON public.isotope_analyses(created_at DESC);

-- Create GIN index for JSONB columns for efficient querying
CREATE INDEX IF NOT EXISTS idx_isotope_analyses_detected_isotopes ON public.isotope_analyses USING GIN(detected_isotopes);
CREATE INDEX IF NOT EXISTS idx_isotope_analyses_spectrum_data ON public.isotope_analyses USING GIN(spectrum_data);
CREATE INDEX IF NOT EXISTS idx_isotope_analyses_analysis_parameters ON public.isotope_analyses USING GIN(analysis_parameters);

-- Create GIN index for array column
CREATE INDEX IF NOT EXISTS idx_isotope_analyses_isotope_families ON public.isotope_analyses USING GIN(isotope_families_detected);

-- Create a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_isotope_analyses_updated_at ON public.isotope_analyses;
CREATE TRIGGER update_isotope_analyses_updated_at
    BEFORE UPDATE ON public.isotope_analyses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Optional: Create a table for real-time status tracking
CREATE TABLE IF NOT EXISTS public.realtime_status (
    id BIGSERIAL PRIMARY KEY,
    session_id UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_counts INTEGER,
    elapsed_time INTEGER, -- in seconds
    status TEXT NOT NULL DEFAULT 'idle',
    additional_data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for realtime_status
CREATE INDEX IF NOT EXISTS idx_realtime_status_timestamp ON public.realtime_status(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_realtime_status_session_id ON public.realtime_status(session_id);

-- Trigger for realtime_status updated_at
DROP TRIGGER IF EXISTS update_realtime_status_updated_at ON public.realtime_status;
CREATE TRIGGER update_realtime_status_updated_at
    BEFORE UPDATE ON public.realtime_status
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Optional: Create a table for system logs
CREATE TABLE IF NOT EXISTS public.system_logs (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    level TEXT NOT NULL DEFAULT 'info', -- debug, info, warning, error, critical
    message TEXT NOT NULL,
    source TEXT, -- e.g., 'flask-api', 'analysis-notebook', 'frontend'
    analysis_id UUID REFERENCES public.isotope_analyses(analysis_id),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for system_logs
CREATE INDEX IF NOT EXISTS idx_system_logs_timestamp ON public.system_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_system_logs_level ON public.system_logs(level);
CREATE INDEX IF NOT EXISTS idx_system_logs_analysis_id ON public.system_logs(analysis_id);

-- Row Level Security (RLS) - Enable if needed
-- ALTER TABLE public.isotope_analyses ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.realtime_status ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

-- Create policies for RLS (uncomment if you want to enable RLS)
-- CREATE POLICY "Enable read access for all users" ON public.isotope_analyses FOR SELECT USING (true);
-- CREATE POLICY "Enable insert access for authenticated users" ON public.isotope_analyses FOR INSERT WITH CHECK (true);
-- CREATE POLICY "Enable update access for authenticated users" ON public.isotope_analyses FOR UPDATE USING (true);

-- Create a view for analysis summary statistics
CREATE OR REPLACE VIEW public.analysis_summary AS
SELECT 
    ia_day.analysis_date,
    COUNT(*) as total_analyses,
    AVG(ia.total_peaks_found) as avg_peaks,
    AVG(ia.background_peaks) as avg_background_peaks,
    COUNT(DISTINCT ia.sample_name) as unique_samples,
    ARRAY_AGG(DISTINCT iso.isotope) as all_isotopes_detected
FROM (
    SELECT *
    FROM public.isotope_analyses
    WHERE status = 'completed'
) ia
LEFT JOIN LATERAL unnest(ia.isotope_families_detected) AS iso(isotope) ON true
LEFT JOIN (
    SELECT DATE_TRUNC('day', timestamp) AS analysis_date, id
    FROM public.isotope_analyses
) ia_day ON ia_day.id = ia.id
GROUP BY ia_day.analysis_date
ORDER BY ia_day.analysis_date DESC;

-- Create a view for isotope frequency analysis
CREATE OR REPLACE VIEW public.isotope_frequency AS
SELECT 
    isotope,
    COUNT(*) as detection_count,
    COUNT(DISTINCT sample_name) as unique_samples,
    ROUND(COUNT(*)::numeric / (SELECT COUNT(*) FROM public.isotope_analyses WHERE status = 'completed') * 100, 2) as detection_percentage
FROM public.isotope_analyses,
LATERAL unnest(isotope_families_detected) as isotope
WHERE status = 'completed'
GROUP BY isotope
ORDER BY detection_count DESC;

-- Create a function to get recent analysis statistics
CREATE OR REPLACE FUNCTION get_analysis_stats(days_back INTEGER DEFAULT 30)
RETURNS TABLE(
    total_analyses BIGINT,
    total_isotopes_detected BIGINT,
    unique_isotopes BIGINT,
    avg_peaks_per_analysis NUMERIC,
    most_common_isotope TEXT,
    recent_analysis_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        (SELECT COUNT(*) FROM public.isotope_analyses WHERE status = 'completed'),
        (SELECT SUM(array_length(isotope_families_detected, 1)) FROM public.isotope_analyses WHERE status = 'completed'),
        (SELECT COUNT(DISTINCT isotope) FROM public.isotope_analyses, LATERAL unnest(isotope_families_detected) as isotope WHERE status = 'completed'),
        (SELECT ROUND(AVG(total_peaks_found), 2) FROM public.isotope_analyses WHERE status = 'completed'),
        (SELECT isotope FROM public.isotope_frequency LIMIT 1),
        (SELECT COUNT(*) FROM public.isotope_analyses WHERE status = 'completed' AND timestamp >= NOW() - INTERVAL '1 day' * days_back);
END;
$$ LANGUAGE plpgsql;

-- Create a function to clean old realtime status entries (optional maintenance)
CREATE OR REPLACE FUNCTION cleanup_old_realtime_data(hours_back INTEGER DEFAULT 24)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.realtime_status 
    WHERE timestamp < NOW() - INTERVAL '1 hour' * hours_back;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Insert some sample data (optional - remove in production)
-- INSERT INTO public.isotope_analyses (
--     sample_name,
--     detected_isotopes,
--     total_peaks_found,
--     background_peaks,
--     isotope_families_detected,
--     spectrum_data,
--     analysis_parameters,
--     status
-- ) VALUES (
--     'Sample Test Data',
--     '{"Cs-137": {"Cs-137": {"energy": "661.7", "intensity": "85.1", "half_life": "30.17 y"}}}',
--     25,
--     5,
--     ARRAY['Cs-137'],
--     '{"measured_spectrum": {"energies": ["100", "200", "661.7"], "counts": [50, 30, 200]}, "background_spectrum": {"energies": ["100", "200"], "counts": [10, 5]}}',
--     '{"min_snr": 3.0, "energy_tolerance": 2.0, "min_z_score": 2.0, "dict_match_tolerance": 2.0}',
--     'completed'
-- );

-- Grant necessary permissions (adjust based on your needs)
-- GRANT ALL ON public.isotope_analyses TO authenticated;
-- GRANT ALL ON public.realtime_status TO authenticated;
-- GRANT SELECT ON public.analysis_summary TO authenticated;
-- GRANT SELECT ON public.isotope_frequency TO authenticated;

-- Comments for documentation
COMMENT ON TABLE public.isotope_analyses IS 'Main table storing gamma spectroscopy analysis results';
COMMENT ON COLUMN public.isotope_analyses.analysis_id IS 'Unique identifier for each analysis';
COMMENT ON COLUMN public.isotope_analyses.detected_isotopes IS 'JSON object containing detected isotopes with their properties';
COMMENT ON COLUMN public.isotope_analyses.spectrum_data IS 'JSON object containing measured and background spectrum data';
COMMENT ON COLUMN public.isotope_analyses.isotope_families_detected IS 'Array of isotope family names detected in the sample';
COMMENT ON COLUMN public.isotope_analyses.plot_image IS 'Base64 encoded spectrum plot image';

COMMENT ON TABLE public.realtime_status IS 'Table for storing real-time data collection status';
COMMENT ON TABLE public.system_logs IS 'System logging table for debugging and monitoring';

COMMENT ON VIEW public.analysis_summary IS 'Daily summary statistics of analyses performed';
COMMENT ON VIEW public.isotope_frequency IS 'Frequency analysis of detected isotopes across all samples';

-- Final message
SELECT 'Database schema for Isotope Analysis Platform created successfully!' as message;