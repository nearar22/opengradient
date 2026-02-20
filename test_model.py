"""Quick test of the AMM Fee Optimization model."""
import os
import opengradient as og
import numpy as np
from dotenv import load_dotenv

load_dotenv()
PRIVATE_KEY = os.getenv("PRIVATE_KEY")
MODEL_CID = "ur_9aUT9KW3RbAj3nsqP1Fors3tblkUf4Hw4D0QFDXc"

client = og.init(private_key=PRIVATE_KEY)

# 15 sample features as numpy array
features = np.array([[0.01, -0.02, 0.005, 0.03, -0.01, 
                       0.015, -0.005, 0.02, 0.01, -0.015, 
                       0.008, 0.012, -0.003, 0.025, 0.007]], dtype=np.float32)

print(f"Input shape: {features.shape}")
print(f"Calling model: {MODEL_CID}")

try:
    result = client.alpha.infer(
        model_cid=MODEL_CID,
        model_input={"X": features},
        inference_mode=og.InferenceMode.VANILLA
    )
    print(f"SUCCESS!")
    print(f"Tx Hash: {result.transaction_hash}")
    print(f"Output: {result.model_output}")
except Exception as e:
    print(f"Error: {e}")
    # Check if it's the event-not-found error (tx still succeeded)
    if "InferenceResult event not found" in str(e):
        print("\nNote: Transaction succeeded (ETH consumed) but output event was not emitted.")
        print("This may be a devnet issue. The model inference itself likely worked.")
