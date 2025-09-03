-- Users and Authentication
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- User management tables
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20),
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'RETAIL_INVESTOR',
    status VARCHAR(50) DEFAULT 'PENDING_VERIFICATION',
    email_verified BOOLEAN DEFAULT FALSE,
    phone_verified BOOLEAN DEFAULT FALSE,
    kyc_completed BOOLEAN DEFAULT FALSE,
    google_id VARCHAR(100),
    linkedin_id VARCHAR(100),
    last_login_at TIMESTAMP WITH TIME ZONE,
    last_login_ip INET,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE user_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100),
    date_of_birth DATE,
    investor_type VARCHAR(50) DEFAULT 'INDIVIDUAL',
    pan_number VARCHAR(10),
    aadhaar_number VARCHAR(12),
    passport_number VARCHAR(20),
    gstin VARCHAR(15),
    cin VARCHAR(21),
    address_line1 TEXT,
    address_line2 TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    pincode VARCHAR(10),
    country VARCHAR(100) DEFAULT 'India',
    annual_income DECIMAL(15,2),
    net_worth DECIMAL(15,2),
    risk_profile VARCHAR(50) DEFAULT 'MODERATE',
    investment_objectives TEXT[],
    investment_experience TEXT[],
    bank_account_number VARCHAR(20),
    bank_name VARCHAR(100),
    ifsc_code VARCHAR(11),
    account_holder_name VARCHAR(100),
    is_politically_exposed BOOLEAN DEFAULT FALSE,
    pep_details TEXT,
    sanction_list_checks TEXT[],
    last_aml_check TIMESTAMP WITH TIME ZONE,
    additional_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- KYC Documents
CREATE TABLE kyc_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_type VARCHAR(50) NOT NULL,
    document_number VARCHAR(100) NOT NULL,
    document_url TEXT NOT NULL,
    document_hash VARCHAR(64),
    status VARCHAR(50) DEFAULT 'PENDING',
    expiry_date DATE,
    verification_data JSONB,
    rejection_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trading tables
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    bond_id VARCHAR(50) NOT NULL,
    order_type VARCHAR(20) NOT NULL,
    side VARCHAR(10) NOT NULL,
    quantity DECIMAL(15,2) NOT NULL,
    filled_quantity DECIMAL(15,2) DEFAULT 0,
    price DECIMAL(10,4),
    stop_price DECIMAL(10,4),
    average_price DECIMAL(10,4),
    status VARCHAR(20) DEFAULT 'PENDING',
    time_in_force VARCHAR(10) DEFAULT 'GTC',
    hidden_quantity DECIMAL(15,2),
    notes TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_bond_id ON orders(bond_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at);

CREATE TABLE trades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bond_id VARCHAR(50) NOT NULL,
    buy_order_id UUID NOT NULL,
    sell_order_id UUID NOT NULL,
    buy_user_id UUID NOT NULL REFERENCES users(id),
    sell_user_id UUID NOT NULL REFERENCES users(id),
    quantity DECIMAL(15,2) NOT NULL,
    price DECIMAL(10,4) NOT NULL,
    total_value DECIMAL(15,2) NOT NULL,
    buyer_fee DECIMAL(10,4) DEFAULT 0,
    seller_fee DECIMAL(10,4) DEFAULT 0,
    executed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_trades_bond_id ON trades(bond_id);
CREATE INDEX idx_trades_executed_at ON trades(executed_at);

-- Convert trades table to hypertable for time-series optimization
SELECT create_hypertable('trades', 'executed_at');

-- Market data table (time-series)
CREATE TABLE market_data (
    id UUID DEFAULT uuid_generate_v4(),
    isin VARCHAR(12) NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    price DECIMAL(10,4) NOT NULL,
    volume BIGINT NOT NULL,
    yield DECIMAL(8,6),
    source VARCHAR(10) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    metadata JSONB,
    PRIMARY KEY (isin, timestamp)
);

SELECT create_hypertable('market_data', 'timestamp');

-- News sentiment table
CREATE TABLE news_sentiment (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    headline TEXT NOT NULL,
    content TEXT,
    sentiment_score DECIMAL(5,4),
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    source VARCHAR(100),
    relevance DECIMAL(3,2),
    entities TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_news_sentiment_timestamp ON news_sentiment(timestamp);

-- Bond information table
CREATE TABLE bonds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    isin VARCHAR(12) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    issuer VARCHAR(200) NOT NULL,
    face_value DECIMAL(15,2) NOT NULL,
    coupon_rate DECIMAL(8,6) NOT NULL,
    maturity_date DATE NOT NULL,
    issue_date DATE NOT NULL,
    credit_rating VARCHAR(10),
    sector VARCHAR(50),
    listing_exchange VARCHAR(10),
    minimum_investment DECIMAL(15,2) DEFAULT 10000,
    is_active BOOLEAN DEFAULT TRUE,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Compliance and audit tables
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id VARCHAR(100),
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);

-- Portfolio holdings
CREATE TABLE portfolio_holdings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    bond_id VARCHAR(50) NOT NULL,
    quantity DECIMAL(15,2) NOT NULL,
    average_price DECIMAL(10,4) NOT NULL,
    current_value DECIMAL(15,2),
    unrealized_pnl DECIMAL(15,2),
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_portfolio_user_id ON portfolio_holdings(user_id);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_kyc_documents_updated_at BEFORE UPDATE ON kyc_documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bonds_updated_at BEFORE UPDATE ON bonds
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
