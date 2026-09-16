import sys, json, hashlib, platform, subprocess
from datetime import date
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT))
import pandas as pd
import numpy as np
import sklearn, xgboost, shap
from sklearn.model_selection import GroupShuffleSplit
from src.outlier_detection.detector import OutlierDetector
from src.drift_prediction.predictor import DriftPredictor
from src.explainability.explainer import BurnInExplainer
from src.evaluation.evaluate import evaluate_anomaly_detection, evaluate_drift_prediction, evaluate_explainability
OUT=Path(__file__).parent
m=pd.read_csv(ROOT/'data/generated/burnin_measurements.csv')
l=pd.read_csv(ROOT/'data/generated/burnin_labels.csv')
print('Loaded',len(l),'components',flush=True)
a=OutlierDetector().detect(m)
print('Module A complete',flush=True)
p=DriftPredictor().fit(m)
pred=p.predict(m); flags=p.flag_for_rejection(m)
e=BurnInExplainer(measurements_df=m,drift_predictor=p,outlier_results_df=a,labels_df=l)
joined=a.merge(l,on=['component_id','lot_id'])
sample=joined[joined.defect_type!='normal'].sort_values('anomaly_score',ascending=False).head(5).component_id.tolist()+joined[joined.defect_type=='normal'].sample(n=5,random_state=42).component_id.tolist()
ex=evaluate_explainability(e,sample)
def flag_summary(f,labels):
    j=f.merge(labels,on=['component_id','lot_id'])
    return {str(k):{'total':len(g),'flagged':int(g.flagged_for_rejection.sum())} for k,g in j.groupby('defect_type')}
static=m.assign(is_anomalous=m.value_168h.gt(np.where(m.param_name.eq('leakage_current_uA'),50,18))).groupby('component_id',as_index=False).is_anomalous.max()
within=m.assign(ok=m.value_168h.le(np.where(m.param_name.eq('leakage_current_uA'),50,18))).groupby('component_id').ok.all()
candidate=joined[(joined.defect_type=='latent') & joined.is_anomalous & joined.component_id.map(within)].merge(flags,on=['component_id','lot_id'])
candidate=candidate[~candidate.flagged_for_rejection].sort_values('anomaly_score',ascending=False)
cid=candidate.iloc[0].component_id
case=e.generate_qa_report(cid)
case['lot_medians']=m[m.lot_id.eq(case['lot_id'])].groupby('param_name')[[f'value_{t}h' for t in [0,24,96,168]]].median().to_dict(orient='index')
overlap=a.merge(static,on='component_id',suffixes=('_a','_static')).merge(l,on='component_id')
print('Fitting separate holdout model',flush=True)
tr,te=next(GroupShuffleSplit(n_splits=1,test_size=.25,random_state=42).split(m,groups=m.lot_id))
train=m.iloc[tr]; test=m.iloc[te]
hp=DriftPredictor().fit(train); hpred=hp.predict(test); hf=hp.flag_for_rejection(test)
try:
    code_commit=subprocess.check_output(['git','-C',str(ROOT),'rev-parse','--short','HEAD'],text=True).strip()
except (OSError,subprocess.CalledProcessError):
    code_commit='unavailable'
out={
 'date':date.today().isoformat(),'git_commit':code_commit,
 'runtime':{'python':platform.python_version(),'pandas':pd.__version__,'sklearn':sklearn.__version__,'xgboost':xgboost.__version__,'shap':shap.__version__},
 'data':{'components':len(l),'lots':l.lot_id.nunique(),'measurement_rows':len(m),'classes':l.defect_type.value_counts().to_dict(),'sha256':{n:hashlib.sha256((ROOT/'data/generated'/n).read_bytes()).hexdigest() for n in ['burnin_measurements.csv','burnin_labels.csv']}},
 'module_a':evaluate_anomaly_detection(a,l),
 'static_168h':evaluate_anomaly_detection(static,l),
 'additional_defects_flagged_below_both_168h_limits':int(((overlap.defect_type!='normal') & overlap.is_anomalous_a & ~overlap.is_anomalous_static).sum()),
 'module_b_in_sample':evaluate_drift_prediction(pred,m,l),
 'safety_slope_in_sample':flag_summary(flags,l),
 'explainability':ex,
 'holdout':{'method':'GroupShuffleSplit test_size=0.25 random_state=42; fit on training lots, infer cohort statistics using only 0h and 24h of test lots', 'train_lots':sorted(train.lot_id.unique().tolist()),'test_lots':sorted(test.lot_id.unique().tolist()),'train_components':train.component_id.nunique(),'test_components':test.component_id.nunique(),'metrics':evaluate_drift_prediction(hpred,test,l),'safety_slope':flag_summary(hf,l)},
 'case_study':case
}
(OUT/'evidence.json').write_text(json.dumps(out,indent=2,default=lambda v:v.item() if hasattr(v,'item') else str(v)),encoding='utf-8')
print(json.dumps({k:out[k] for k in ['module_a','static_168h','additional_defects_flagged_below_both_168h_limits','safety_slope_in_sample','holdout']},indent=2),flush=True)
print('CASE',cid,flush=True)
