-- Pay calculation vectors. Must match shared/pay_test_vectors.json.
do $$
begin
  assert fn_earned('DAY',24000,'DAY_PORTION',1,null,null) = 24000, 'vector V01';
  assert fn_earned('DAY',24000,'DAY_PORTION',0.5,null,null) = 12000, 'vector V02';
  assert fn_earned('DAY',18000,'DAY_PORTION',0.25,null,null) = 4500, 'vector V03';
  assert fn_earned('DAY',18000,'DAY_PORTION',0.75,null,null) = 13500, 'vector V04';
  assert fn_earned('DAY',25000,'DAY_PORTION',0.3333,null,null) = 8333, 'vector V05';
  assert fn_earned('DAY',24000,'DAY_MINUTES',null,180,480) = 9000, 'vector V06';
  assert fn_earned('DAY',20000,'DAY_MINUTES',null,300,450) = 13333, 'vector V07';
  assert fn_earned('DAY',24000,'NO_WORK',null,null,null) = 0, 'vector V08';
  assert fn_earned('HOUR',3000,'HOUR_MINUTES',null,450,null) = 22500, 'vector V09';
  assert fn_earned('HOUR',2750,'HOUR_MINUTES',null,80,null) = 3667, 'vector V10';
  assert fn_earned('HOUR',2250,'HOUR_MINUTES',null,15,null) = 563, 'vector V11';
  assert fn_earned('HOUR',1875,'HOUR_MINUTES',null,50,null) = 1563, 'vector V12';
  assert fn_earned('HOUR',4500,'HOUR_MINUTES',null,600,null) = 45000, 'vector V13';
  assert fn_earned('HOUR',3000,'NO_WORK',null,null,null) = 0, 'vector V14';
  raise notice '01_pay_vectors: PASS';
end $$;
