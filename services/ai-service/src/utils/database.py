import asyncpg
import logging
from typing import Optional, List, Dict, Any
import os
from contextlib import asynccontextmanager

logger = logging.getLogger(__name__)

class Database:
    def __init__(self):
        self.pool: Optional[asyncpg.Pool] = None
        self.connection_params = {
            'host': os.getenv('POSTGRES_HOST', 'localhost'),
            'port': int(os.getenv('POSTGRES_PORT', '5432')),
            'database': os.getenv('POSTGRES_DB', 'setubond'),
            'user': os.getenv('POSTGRES_USER', 'postgres'),
            'password': os.getenv('POSTGRES_PASSWORD', 'password'),
            'min_size': 5,
            'max_size': 20,
            'command_timeout': 30,
        }

    async def connect(self):
        """Initialize database connection pool"""
        try:
            self.pool = await asyncpg.create_pool(**self.connection_params)
            logger.info("Database connection pool created successfully")
            
            # Test connection
            async with self.pool.acquire() as conn:
                await conn.execute('SELECT 1')
            logger.info("Database connection test successful")
            
        except Exception as e:
            logger.error(f"Failed to create database connection pool: {e}")
            raise

    async def disconnect(self):
        """Close database connection pool"""
        if self.pool:
            await self.pool.close()
            logger.info("Database connection pool closed")

    @asynccontextmanager
    async def get_connection(self):
        """Get database connection from pool"""
        if not self.pool:
            raise RuntimeError("Database pool not initialized")
        
        async with self.pool.acquire() as conn:
            yield conn

    async def execute_query(self, query: str, *args) -> List[Dict[str, Any]]:
        """Execute SELECT query and return results as list of dictionaries"""
        try:
            async with self.get_connection() as conn:
                rows = await conn.fetch(query, *args)
                return [dict(row) for row in rows]
        except Exception as e:
            logger.error(f"Error executing query: {e}")
            raise

    async def execute_command(self, command: str, *args) -> str:
        """Execute INSERT/UPDATE/DELETE command"""
        try:
            async with self.get_connection() as conn:
                result = await conn.execute(command, *args)
                return result
        except Exception as e:
            logger.error(f"Error executing command: {e}")
            raise

    async def execute_transaction(self, commands: List[tuple]) -> bool:
        """Execute multiple commands in a transaction"""
        try:
            async with self.get_connection() as conn:
                async with conn.transaction():
                    for command, args in commands:
                        await conn.execute(command, *args)
                return True
        except Exception as e:
            logger.error(f"Transaction failed: {e}")
            raise

    async def get_market_data(self, bond_id: str, limit: int = 1000) -> List[Dict[str, Any]]:
        """Get market data for a specific bond"""
        query = """
            SELECT timestamp, price, volume, yield
            FROM market_data
            WHERE isin = $1
            ORDER BY timestamp DESC
            LIMIT $2
        """
        return await self.execute_query(query, bond_id, limit)

    async def get_trading_data(self, bond_id: str, days: int = 30) -> List[Dict[str, Any]]:
        """Get trading data for a specific bond"""
        query = """
            SELECT executed_at, quantity, price, total_value
            FROM trades
            WHERE bond_id = $1 
            AND executed_at >= NOW() - INTERVAL '%s days'
            ORDER BY executed_at DESC
        """
        return await self.execute_query(query % days, bond_id)

    async def get_user_portfolio(self, user_id: str) -> Dict[str, Any]:
        """Get user portfolio information"""
        try:
            # Get portfolio holdings
            holdings_query = """
                SELECT bond_id, quantity, average_price, current_value, unrealized_pnl
                FROM portfolio_holdings
                WHERE user_id = $1
            """
            holdings = await self.execute_query(holdings_query, user_id)
            
            # Get user profile
            profile_query = """
                SELECT u.role, up.risk_profile, up.investment_objectives
                FROM users u
                LEFT JOIN user_profiles up ON u.id = up.user_id
                WHERE u.id = $1
            """
            profile_data = await self.execute_query(profile_query, user_id)
            profile = profile_data[0] if profile_data else {}
            
            return {
                'user_id': user_id,
                'holdings': holdings,
                'profile': profile,
                'total_value': sum(h.get('current_value', 0) for h in holdings),
                'total_pnl': sum(h.get('unrealized_pnl', 0) for h in holdings)
            }
            
        except Exception as e:
            logger.error(f"Error getting user portfolio: {e}")
            return {'user_id': user_id, 'holdings': [], 'profile': {}}

    async def get_available_bonds(self) -> List[Dict[str, Any]]:
        """Get all available bonds for trading"""
        query = """
            SELECT 
                b.id, b.isin, b.name, b.issuer, b.face_value, b.coupon_rate,
                b.maturity_date, b.credit_rating, b.sector, b.minimum_investment,
                EXTRACT(YEAR FROM AGE(b.maturity_date, CURRENT_DATE)) as years_to_maturity,
                md.price as current_price, md.yield as current_yield,
                COALESCE(ts.avg_volume, 0) as avg_daily_volume,
                COALESCE(ts.bid_ask_spread, 0.01) as bid_ask_spread
            FROM bonds b
            LEFT JOIN LATERAL (
                SELECT price, yield
                FROM market_data
                WHERE isin = b.isin
                ORDER BY timestamp DESC
                LIMIT 1
            ) md ON true
            LEFT JOIN LATERAL (
                SELECT 
                    AVG(quantity) as avg_volume,
                    0.01 as bid_ask_spread  -- Mock spread
                FROM trades
                WHERE bond_id = b.isin
                AND executed_at >= CURRENT_DATE - INTERVAL '30 days'
            ) ts ON true
            WHERE b.is_active = true
            ORDER BY b.name
        """
        
        try:
            bonds = await self.execute_query(query)
            
            # Add calculated fields
            for bond in bonds:
                bond['yield_to_maturity'] = bond.get('current_yield', 0.06)
                bond['market_cap'] = bond.get('face_value', 1000000000)  # Mock market cap
                
            return bonds
            
        except Exception as e:
            logger.error(f"Error getting available bonds: {e}")
            # Return mock data
            return [
                {
                    'id': 'BOND001',
                    'isin': 'INE001A01036',
                    'name': 'HDFC Bank Bond 2027',
                    'issuer': 'HDFC Bank Limited',
                    'face_value': 1000,
                    'coupon_rate': 0.0675,
                    'credit_rating': 'AAA',
                    'sector': 'Banking',
                    'years_to_maturity': 3.5,
                    'yield_to_maturity': 0.0675,
                    'minimum_investment': 10000,
                    'avg_daily_volume': 50000,
                    'bid_ask_spread': 0.005,
                    'market_cap': 1000000000
                }
            ]

    async def store_prediction_result(self, 
                                    model_type: str,
                                    bond_id: str,
                                    prediction_data: Dict[str, Any]) -> bool:
        """Store AI model prediction results"""
        try:
            command = """
                INSERT INTO ai_predictions (model_type, bond_id, prediction_data, created_at)
                VALUES ($1, $2, $3, NOW())
                ON CONFLICT (model_type, bond_id) DO UPDATE SET
                prediction_data = EXCLUDED.prediction_data,
                created_at = EXCLUDED.created_at
            """
            
            await self.execute_command(command, model_type, bond_id, prediction_data)
            return True
            
        except Exception as e:
            logger.error(f"Error storing prediction result: {e}")
            return False

    async def get_issuer_financials(self, issuer_id: str) -> Dict[str, Any]:
        """Get issuer financial data for credit risk analysis"""
        try:
            query = """
                SELECT 
                    debt_to_equity_ratio, current_ratio, return_on_assets,
                    revenue_growth_rate, interest_coverage_ratio, net_profit_margin,
                    total_assets, total_debt, revenue, net_income
                FROM issuer_financials
                WHERE issuer_id = $1
                ORDER BY reporting_date DESC
                LIMIT 1
            """
            
            result = await self.execute_query(query, issuer_id)
            
            if result:
                return result[0]
            else:
                # Return mock financial data
                return {
                    'debt_to_equity_ratio': 1.2,
                    'current_ratio': 1.5,
                    'return_on_assets': 0.08,
                    'revenue_growth_rate': 0.12,
                    'interest_coverage_ratio': 4.5,
                    'net_profit_margin': 0.15,
                    'total_assets': 1000000000,
                    'total_debt': 400000000,
                    'revenue': 500000000,
                    'net_income': 75000000
                }
                
        except Exception as e:
            logger.error(f"Error getting issuer financials: {e}")
            return {}

    async def get_news_sentiment(self, issuer_id: str) -> Dict[str, Any]:
        """Get news sentiment data for an issuer"""
        try:
            query = """
                SELECT 
                    AVG(sentiment_score) as avg_sentiment,
                    COUNT(*) as news_count,
                    AVG(relevance) as avg_relevance
                FROM news_sentiment
                WHERE entities @> $1
                AND timestamp >= NOW() - INTERVAL '30 days'
            """
            
            result = await self.execute_query(query, [issuer_id])
            
            if result and result[0]['news_count']:
                return {
                    'sentiment_score': float(result[0]['avg_sentiment'] or 0),
                    'news_volume': int(result[0]['news_count']),
                    'relevance': float(result[0]['avg_relevance'] or 0.5)
                }
            else:
                # Return neutral sentiment if no data
                return {
                    'sentiment_score': 0.0,
                    'news_volume': 0,
                    'relevance': 0.5
                }
                
        except Exception as e:
            logger.error(f"Error getting news sentiment: {e}")
            return {'sentiment_score': 0.0, 'news_volume': 0, 'relevance': 0.5}

    async def check_connection(self) -> bool:
        """Check if database connection is healthy"""
        try:
            if not self.pool:
                return False
            
            async with self.get_connection() as conn:
                await conn.execute('SELECT 1')
            return True
            
        except Exception as e:
            logger.error(f"Database health check failed: {e}")
            return False

    async def create_tables_if_not_exist(self):
        """Create AI service specific tables if they don't exist"""
        tables = [
            """
            CREATE TABLE IF NOT EXISTS ai_predictions (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                model_type VARCHAR(50) NOT NULL,
                bond_id VARCHAR(50) NOT NULL,
                prediction_data JSONB NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                UNIQUE(model_type, bond_id)
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS issuer_financials (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                issuer_id VARCHAR(100) NOT NULL,
                reporting_date DATE NOT NULL,
                debt_to_equity_ratio DECIMAL(8,4),
                current_ratio DECIMAL(8,4),
                return_on_assets DECIMAL(8,6),
                revenue_growth_rate DECIMAL(8,6),
                interest_coverage_ratio DECIMAL(8,4),
                net_profit_margin DECIMAL(8,6),
                total_assets BIGINT,
                total_debt BIGINT,
                revenue BIGINT,
                net_income BIGINT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                UNIQUE(issuer_id, reporting_date)
            )
            """
        ]
        
        try:
            for table_sql in tables:
                await self.execute_command(table_sql)
            logger.info("AI service tables created/verified successfully")
            
        except Exception as e:
            logger.error(f"Error creating AI service tables: {e}")
