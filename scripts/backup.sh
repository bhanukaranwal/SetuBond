#!/bin/bash

# SetuBond Backup Script
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backup/setubond"
NAMESPACE="setubond"

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup PostgreSQL
echo "📦 Backing up PostgreSQL database..."
kubectl exec -n $NAMESPACE deployment/postgres -- pg_dump -U postgres setubond > $BACKUP_DIR/postgres_$DATE.sql

# Backup Redis
echo "📦 Backing up Redis data..."
kubectl exec -n $NAMESPACE deployment/redis -- redis-cli BGSAVE
kubectl cp $NAMESPACE/redis-0:/data/dump.rdb $BACKUP_DIR/redis_$DATE.rdb

# Backup Kubernetes configurations
echo "📦 Backing up Kubernetes configurations..."
kubectl get all -n $NAMESPACE -o yaml > $BACKUP_DIR/k8s_config_$DATE.yaml

# Compress backups
tar -czf $BACKUP_DIR/setubond_backup_$DATE.tar.gz $BACKUP_DIR/*_$DATE.*

echo "✅ Backup completed: setubond_backup_$DATE.tar.gz"
