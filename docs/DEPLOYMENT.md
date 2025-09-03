# SetuBond Platform Deployment Guide

## Prerequisites

### Required Software
- **Docker** >= 20.10
- **Kubernetes** >= 1.24
- **kubectl** >= 1.24
- **Terraform** >= 1.0
- **Helm** >= 3.8
- **AWS CLI** >= 2.0

### Required Accounts
- AWS Account with appropriate permissions
- Docker Hub account (or ECR)
- Domain name for production deployment

## Local Development Deployment

### 1. Quick Start
Clone repository
git clone https://github.com/setubond/platform.git
cd setubond-platform

Copy environment file
cp .env.example .env

Start all services
docker-compose up -d

Verify services
docker-compose ps

text

### 2. Service Access
- **Frontend**: http://localhost:3008
- **API Gateway**: http://localhost:3000
- **API Documentation**: http://localhost:3000/api/docs
- **Database**: localhost:5432
- **Redis**: localhost:6379
- **Kafka**: localhost:9092

### 3. Initial Setup
Run database migrations
npm run migration:run

Seed initial data
npm run seed:dev

Create admin user
npm run create-admin

text

## Production Deployment

### Phase 1: Infrastructure Setup

#### 1. AWS Infrastructure
cd infrastructure/terraform
terraform init
terraform plan -var-file="prod.tfvars"
terraform apply

text

#### 2. Configure kubectl
aws eks update-kubeconfig --region ap-south-1 --name setubond-cluster

text

#### 3. Install Required Tools
Install NGINX Ingress Controller
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.1/deploy/static/provider/aws/deploy.yaml

Install Cert-Manager for TLS
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.12.0/cert-manager.yaml

Install Prometheus & Grafana
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install monitoring prometheus-community/kube-prometheus-stack

text

### Phase 2: Application Deployment

#### 1. Create Secrets
kubectl create secret generic postgres-secret
--from-literal=password=your-postgres-password

kubectl create secret generic jwt-secret
--from-literal=secret=your-jwt-secret
--from-literal=refresh-secret=your-refresh-secret

kubectl create secret generic api-keys
--from-literal=nse-api-key=your-nse-key
--from-literal=bse-api-key=your-bse-key
--from-literal=openai-api-key=your-openai-key

text

#### 2. Deploy Applications
Deploy database first
kubectl apply -f infrastructure/k8s/postgres.yaml

Deploy all services
kubectl apply -f infrastructure/k8s/

Verify deployment
kubectl get pods -n setubond

text

#### 3. Setup Domain & TLS
Apply ingress configuration
kubectl apply -f infrastructure/k8s/ingress.yaml

Verify certificate creation
kubectl describe certificate setubond-tls -n setubond

text

### Phase 3: Post-Deployment Setup

#### 1. Database Initialization
kubectl exec -it deployment/postgres -n setubond -- psql -U postgres -d setubond

Run migration scripts
text

#### 2. Monitoring Setup
Access Grafana dashboard
kubectl port-forward svc/monitoring-grafana 3000:80

Import SetuBond dashboards
Navigate to http://localhost:3000 (admin/prom-operator)
text

#### 3. Load Testing
Install K6 for load testing
kubectl apply -f testing/k6-load-test.yaml

Monitor performance
kubectl logs -f job/k6-load-test

text

## Scaling Configuration

### Auto-scaling Setup
Enable cluster autoscaler
kubectl apply -f infrastructure/k8s/cluster-autoscaler.yaml

Configure HPA for services
kubectl apply -f infrastructure/k8s/hpa.yaml

text

### Performance Tuning
Optimize database connections
kubectl patch configmap setubond-config -n setubond --patch '{"data":{"DB_POOL_SIZE":"50"}}'

Scale Redis for high availability
kubectl scale deployment redis --replicas=3 -n setubond

text

## Security Hardening

### 1. Network Policies
kubectl apply -f infrastructure/k8s/network-policies.yaml

text

### 2. Pod Security Standards
kubectl label namespace setubond pod-security.kubernetes.io/enforce=restricted

text

### 3. RBAC Configuration
kubectl apply -f infrastructure/k8s/rbac.yaml

text

## Backup & Recovery

### Database Backup
Automated backup script
kubectl create cronjob pg-backup
--image=postgres:14
--schedule="0 2 * * *"
-- pg_dump -h postgres-service -U postgres setubond > /backup/$(date +%Y%m%d).sql

text

### Disaster Recovery
Cross-region replication setup
kubectl apply -f infrastructure/k8s/backup-restore.yaml

text

## Monitoring & Observability

### Health Checks
Check all service health
kubectl get pods -n setubond -o wide

Check ingress status
kubectl get ingress -n setubond

text

### Log Aggregation
Deploy ELK stack
helm install elasticsearch elastic/elasticsearch
helm install kibana elastic/kibana
helm install filebeat elastic/filebeat

text

## Troubleshooting

### Common Issues
1. **Pod CrashLoopBackOff**: Check logs with `kubectl logs <pod-name> -n setubond`
2. **Service Unavailable**: Verify service endpoints with `kubectl get endpoints -n setubond`
3. **Database Connection Issues**: Check secrets and network policies
4. **Certificate Issues**: Verify cert-manager logs

### Performance Issues
Check resource usage
kubectl top pods -n setubond

Analyze slow queries
kubectl exec -it deployment/postgres -n setubond -- psql -U postgres -d setubond -c "SELECT * FROM pg_stat_activity;"

text

## Maintenance

### Updates & Rollbacks
Rolling update
kubectl set image deployment/api-gateway api-gateway=setubond/api-gateway:v2.0.0 -n setubond

Rollback if needed
kubectl rollout undo deployment/api-gateway -n setubond

text

### Regular Maintenance Tasks
- Weekly security updates
- Monthly performance reviews
- Quarterly disaster recovery tests
- Bi-annual security audits
docs/API.md
text
# SetuBond API Documentation

## Authentication

All API requests require authentication using JWT tokens.

### Login
POST /api/v1/auth/login
Content-Type: application/json

{
"email": "user@example.com",
"password": "password123"
}

text

Response:
{
"user": {
"id": "uuid",
"email": "user@example.com",
"role": "INVESTOR"
},
"accessToken": "jwt-token",
"refreshToken": "refresh-token"
}

text

## Trading Endpoints

### Create Order
POST /api/v1/trading/orders
Authorization: Bearer {token}
Content-Type: application/json

{
"bondId": "INE001A01036",
"orderType": "LIMIT",
"side": "BUY",
"quantity": 100,
"price": 1050.50
}

text

### Get Order Book
GET /api/v1/trading/orderbook/{bondId}
Authorization: Bearer {token}

text

Response:
{
"bondId": "INE001A01036",
"bids": [
{"price": 1050.25, "quantity": 500, "orders": 3}
],
"asks": [
{"price": 1050.75, "quantity": 300, "orders": 2}
],
"lastUpdate": "2025-09-03T16:30:00Z"
}

text

## AI Analytics Endpoints

### Price Prediction
POST /api/v1/ai/predict/price
Authorization: Bearer {token}
Content-Type: application/json

{
"bondId": "INE001A01036",
"timeHorizon": 30
}

text

## WebSocket Events

### Connect to Real-time Feed
const socket = io('ws://localhost:3006/notifications', {
auth: { token: 'jwt-token' }
});

socket.on('trade_executed', (data) => {
console.log('Trade executed:', data);
});

socket.on('orderbook_update', (data) => {
console.log('Order book update:', data);
});

text

## Error Handling

All API responses follow this error format:
{
"statusCode": 400,
"message": "Validation failed",
"error": "Bad Request",
"timestamp": "2025-09-03T16:30:00Z"
}

text

## Rate Limiting

- **Public endpoints**: 100 requests per minute
- **Authenticated endpoints**: 1000 requests per minute
- **Trading endpoints**: 10 orders per second
