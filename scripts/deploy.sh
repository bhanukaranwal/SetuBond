#!/bin/bash

set -e

# SetuBond Deployment Script
echo "🚀 Starting SetuBond Platform Deployment"

# Check prerequisites
command -v kubectl >/dev/null 2>&1 || { echo "kubectl is required but not installed. Aborting." >&2; exit 1; }
command -v helm >/dev/null 2>&1 || { echo "helm is required but not installed. Aborting." >&2; exit 1; }

# Configuration
NAMESPACE=${NAMESPACE:-setubond}
ENVIRONMENT=${ENVIRONMENT:-production}
IMAGE_TAG=${IMAGE_TAG:-latest}

# Create namespace if not exists
kubectl create namespace $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -

# Apply configurations
echo "📋 Applying configurations..."
kubectl apply -f infrastructure/k8s/configmap.yaml -n $NAMESPACE
kubectl apply -f infrastructure/k8s/secrets.yaml -n $NAMESPACE

# Deploy database
echo "🗄️ Deploying database..."
kubectl apply -f infrastructure/k8s/postgres.yaml -n $NAMESPACE

# Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
kubectl wait --for=condition=ready pod -l app=postgres -n $NAMESPACE --timeout=300s

# Deploy services
echo "🏗️ Deploying services..."
for service in infrastructure/k8s/*-service.yaml; do
    kubectl apply -f $service -n $NAMESPACE
done

# Deploy ingress
echo "🌐 Setting up ingress..."
kubectl apply -f infrastructure/k8s/ingress.yaml -n $NAMESPACE

# Verify deployment
echo "✅ Verifying deployment..."
kubectl get pods -n $NAMESPACE

echo "🎉 Deployment completed successfully!"
echo "📊 Check status with: kubectl get all -n $NAMESPACE"
