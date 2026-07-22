from src.models.jobs.background_job import JobWorkloadClass
from src.platform.jobs.workers.factory import build_configured_workload_worker_runtime

runtime = build_configured_workload_worker_runtime(JobWorkloadClass.CONNECTOR)
broker = runtime.broker
