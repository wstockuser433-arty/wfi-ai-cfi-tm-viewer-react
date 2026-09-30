from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from redis.asyncio import Redis
from ..db.postgres import get_db
from ..db.redis_client import get_redis

DbDep = Depends(get_db)
RedisDep = Depends(get_redis)