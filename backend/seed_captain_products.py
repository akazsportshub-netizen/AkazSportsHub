#!/usr/bin/env python3
"""
Seed script to add CAPTAIN products to the Akaz Sports Hub database
"""
import asyncio
import sys
import os
from pathlib import Path

# Add the backend directory to the path
sys.path.append(str(Path(__file__).parent))

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import uuid
from datetime import datetime

# Load environment variables
load_dotenv()

mongo_url = os.environ['MONGO_URL']
db_name = os.environ['DB_NAME']

async def seed_captain_products():
    """Add CAPTAIN products to the existing database"""
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    print("🎯 Adding CAPTAIN products to Akaz Sports Hub...")
    
    # CAPTAIN Products (Sports Accessories & Protective Gear)
    captain_products = [
        # Soccer Socks
        {
            "id": str(uuid.uuid4()),
            "name": "GOAL 3",
            "brand": "CAPTAIN",
            "category": "Soccer Socks",
            "model_code": "CP-SS-GOAL3",
            "description": "Premium soccer socks with advanced moisture-wicking technology and reinforced heel and toe areas for enhanced durability.",
            "specifications": {
                "material": "Premium polyester blend with moisture-wicking fibers",
                "construction": "Reinforced heel and toe",
                "fit": "Ergonomic design for optimal comfort",
                "length": "Knee-high professional length"
            },
            "features": ["Moisture Wicking", "Reinforced Construction", "Ergonomic Fit", "Professional Grade", "Anti-Blister Technology"],
            "colors": ["Red", "Blue", "Yellow", "Green", "White", "Black"],
            "sizes": ["S", "M", "L", "XL"],
            "images": ["/images/products/captain/socks/goal3-1.jpg", "/images/products/captain/socks/goal3-2.jpg"],
            "price_range": "Contact for pricing",
            "is_active": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        },
        {
            "id": str(uuid.uuid4()),
            "name": "GOAL PLUS",
            "brand": "CAPTAIN",
            "category": "Soccer Socks",
            "model_code": "CP-SS-GOALPLUS",
            "description": "Enhanced soccer socks with superior cushioning and moisture management for professional players.",
            "specifications": {
                "material": "Advanced synthetic blend with compression zones",
                "construction": "Extra padding in critical areas",
                "fit": "Compression fit for improved blood circulation",
                "length": "Professional knee-high design"
            },
            "features": ["Compression Technology", "Extra Cushioning", "Moisture Management", "Professional Grade", "Ergonomic Design"],
            "colors": ["Red/White", "Blue/White", "Black/White", "Green/White"],
            "sizes": ["S", "M", "L", "XL"],
            "images": ["/images/products/captain/socks/goalplus-1.jpg", "/images/products/captain/socks/goalplus-2.jpg"],
            "price_range": "Contact for pricing",
            "is_active": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        },
        {
            "id": str(uuid.uuid4()),
            "name": "MILITANT",
            "brand": "CAPTAIN",
            "category": "Soccer Socks",
            "model_code": "CP-SS-MILITANT",
            "description": "Heavy-duty soccer socks designed for intensive training and competitive play with enhanced durability.",
            "specifications": {
                "material": "Military-grade synthetic fiber blend",
                "construction": "Triple reinforced heel and toe",
                "fit": "Snug athletic fit",
                "durability": "Enhanced wear resistance"
            },
            "features": ["Military Grade Material", "Triple Reinforced", "Enhanced Durability", "Athletic Fit", "Intensive Use Design"],
            "colors": ["Black", "Navy Blue", "Dark Green", "Camouflage"],
            "sizes": ["S", "M", "L", "XL"],
            "images": ["/images/products/captain/socks/militant-1.jpg", "/images/products/captain/socks/militant-2.jpg"],
            "price_range": "Contact for pricing",
            "is_active": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        },
        {
            "id": str(uuid.uuid4()),
            "name": "SPEED",
            "brand": "CAPTAIN",
            "category": "Soccer Socks",
            "model_code": "CP-SS-SPEED",
            "description": "Lightweight soccer socks engineered for speed and agility with aerodynamic design and minimal weight.",
            "specifications": {
                "material": "Ultra-lightweight synthetic fibers",
                "construction": "Seamless toe construction",
                "fit": "Low-profile aerodynamic fit",
                "weight": "Ultra-lightweight design"
            },
            "features": ["Ultra Lightweight", "Aerodynamic Design", "Seamless Construction", "Speed Optimized", "Minimal Weight"],
            "colors": ["White", "Black", "Red", "Blue"],
            "sizes": ["S", "M", "L", "XL"],
            "images": ["/images/products/captain/socks/speed-1.jpg", "/images/products/captain/socks/speed-2.jpg"],
            "price_range": "Contact for pricing",
            "is_active": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        },
        
        # Shin Guards
        {
            "id": str(uuid.uuid4()),
            "name": "HEMRA-09",
            "brand": "CAPTAIN",
            "category": "Shin Guards",
            "model_code": "CP-SG-HEMRA09",
            "description": "Professional-grade shin guards with high-impact resistance and comfortable foam padding for superior protection.",
            "specifications": {
                "shell": "High-density polypropylene shell",
                "padding": "EVA foam padding with moisture-wicking liner",
                "straps": "Adjustable elastic straps with Velcro closure",
                "protection": "CE certified impact protection"
            },
            "features": ["High Impact Resistance", "EVA Foam Padding", "Adjustable Straps", "CE Certified", "Moisture Wicking Liner"],
            "colors": ["Black/Blue", "Black/Red", "Black/Yellow"],
            "sizes": ["Youth", "Adult S", "Adult M", "Adult L"],
            "images": ["/images/products/captain/shinguards/hemra09-1.jpg", "/images/products/captain/shinguards/hemra09-2.jpg"],
            "price_range": "Contact for pricing",
            "is_active": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        },
        {
            "id": str(uuid.uuid4()),
            "name": "IMPERIOUS",
            "brand": "CAPTAIN",
            "category": "Shin Guards",
            "model_code": "CP-SG-IMPERIOUS",
            "description": "Premium shin guards with advanced protection technology and ergonomic design for professional players.",
            "specifications": {
                "shell": "Advanced composite shell with shock absorption",
                "padding": "Multi-layer foam padding system",
                "straps": "Premium elastic straps with quick-release buckles",
                "protection": "Professional grade impact protection"
            },
            "features": ["Advanced Composite Shell", "Multi-Layer Padding", "Quick Release Buckles", "Professional Grade", "Ergonomic Design"],
            "colors": ["Black/Gold", "Black/Silver", "Navy/White"],
            "sizes": ["Adult S", "Adult M", "Adult L", "Adult XL"],
            "images": ["/images/products/captain/shinguards/imperious-1.jpg", "/images/products/captain/shinguards/imperious-2.jpg"],
            "price_range": "Contact for pricing",
            "is_active": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        },
        {
            "id": str(uuid.uuid4()),
            "name": "REGULAR",
            "brand": "CAPTAIN",
            "category": "Shin Guards",
            "model_code": "CP-SG-REGULAR",
            "description": "Standard shin guards with reliable protection and comfortable fit for recreational and training use.",
            "specifications": {
                "shell": "Durable polypropylene shell",
                "padding": "Standard foam padding",
                "straps": "Elastic straps with Velcro closure",
                "protection": "Standard impact protection"
            },
            "features": ["Durable Construction", "Standard Protection", "Comfortable Fit", "Elastic Straps", "Value for Money"],
            "colors": ["Black", "White", "Blue"],
            "sizes": ["Youth", "Adult S", "Adult M", "Adult L"],
            "images": ["/images/products/captain/shinguards/regular-1.jpg", "/images/products/captain/shinguards/regular-2.jpg"],
            "price_range": "Contact for pricing",
            "is_active": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        },
        
        # Captain Bands
        {
            "id": str(uuid.uuid4()),
            "name": "CAPTAIN BAND - YOUTH",
            "brand": "CAPTAIN",
            "category": "Captain Bands",
            "model_code": "CP-CB-YOUTH",
            "description": "Official captain's armband for youth players with 'C' logo and adjustable elastic band for secure fit.",
            "specifications": {
                "material": "Premium elastic fabric with printed logo",
                "design": "Distinctive 'C' logo in diamond shape with stripes",
                "closure": "Adjustable elastic with secure fastening",
                "size": "Youth circumference (20-25cm)"
            },
            "features": ["Official Captain Design", "Adjustable Elastic", "Secure Fastening", "Age Appropriate Size", "Distinctive Logo"],
            "colors": ["Orange/Black", "Red/White", "Blue/White", "Yellow/Black"],
            "sizes": ["Youth (Under-12)", "Youth (Under-15)"],
            "images": ["/images/products/captain/bands/youth-1.jpg", "/images/products/captain/bands/youth-2.jpg"],
            "price_range": "Contact for pricing",
            "is_active": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        },
        {
            "id": str(uuid.uuid4()),
            "name": "CAPTAIN BAND - SENIOR",
            "brand": "CAPTAIN",
            "category": "Captain Bands",
            "model_code": "CP-CB-SENIOR",
            "description": "Professional captain's armband for senior players with premium materials and distinctive leadership design.",
            "specifications": {
                "material": "High-quality elastic fabric with embossed logo",
                "design": "Professional 'C' logo design with team leadership symbolism",
                "closure": "Premium adjustable elastic system",
                "size": "Adult circumference (28-35cm)"
            },
            "features": ["Professional Grade", "Premium Materials", "Leadership Design", "Adult Sizing", "Durable Construction"],
            "colors": ["Orange/Black", "Red/White", "Blue/White", "Green/White"],
            "sizes": ["Adult", "Senior"],
            "images": ["/images/products/captain/bands/senior-1.jpg", "/images/products/captain/bands/senior-2.jpg"],
            "price_range": "Contact for pricing",
            "is_active": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        },
        
        # Jump Ropes
        {
            "id": str(uuid.uuid4()),
            "name": "PREMIUM JUMP ROPE",
            "brand": "CAPTAIN",
            "category": "Jump Ropes",
            "model_code": "CP-JR-PREMIUM",
            "description": "Professional jump rope with ergonomic plastic handles and adjustable length for optimal cardio workouts.",
            "specifications": {
                "handles": "Ergonomic plastic handles with non-slip grip",
                "rope": "Durable PVC rope with smooth rotation",
                "length": "Adjustable up to 3 meters",
                "bearings": "Ball bearing system for smooth rotation"
            },
            "features": ["Ergonomic Handles", "Ball Bearing System", "Adjustable Length", "Non-Slip Grip", "Smooth Rotation"],
            "colors": ["Orange", "Blue", "Green", "Red", "Black"],
            "sizes": ["Adjustable Length"],
            "images": ["/images/products/captain/jumpropes/premium-1.jpg", "/images/products/captain/jumpropes/premium-2.jpg"],
            "price_range": "Contact for pricing",
            "is_active": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        },
        
        # Protective Gear
        {
            "id": str(uuid.uuid4()),
            "name": "KNEE SUPPORT",
            "brand": "CAPTAIN",
            "category": "Protective Gear",
            "model_code": "CP-KS-01",
            "description": "Compression knee support with breathable fabric and adjustable straps for joint stability and injury prevention.",
            "specifications": {
                "material": "Breathable neoprene with compression zones",
                "support": "Lateral and medial stability support",
                "straps": "Adjustable Velcro straps",
                "size_range": "Multiple sizes for optimal fit"
            },
            "features": ["Compression Support", "Breathable Material", "Adjustable Straps", "Joint Stability", "Injury Prevention"],
            "colors": ["Black", "Navy Blue"],
            "sizes": ["S", "M", "L", "XL"],
            "images": ["/images/products/captain/protective/knee-support-1.jpg", "/images/products/captain/protective/knee-support-2.jpg"],
            "price_range": "Contact for pricing",
            "is_active": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        },
        {
            "id": str(uuid.uuid4()),
            "name": "ANKLE SUPPORT",
            "brand": "CAPTAIN",
            "category": "Protective Gear",
            "model_code": "CP-AS-01",
            "description": "Elastic ankle support with compression design for ankle stability and support during sports activities.",
            "specifications": {
                "material": "Elastic compression fabric",
                "support": "360-degree ankle support",
                "design": "Low-profile fit under shoes",
                "compression": "Graduated compression for optimal support"
            },
            "features": ["360-Degree Support", "Compression Design", "Low Profile Fit", "Elastic Material", "Sports Optimized"],
            "colors": ["Black", "Beige"],
            "sizes": ["S", "M", "L", "XL"],
            "images": ["/images/products/captain/protective/ankle-support-1.jpg", "/images/products/captain/protective/ankle-support-2.jpg"],
            "price_range": "Contact for pricing",
            "is_active": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        },
        
        # Sports Tape
        {
            "id": str(uuid.uuid4()),
            "name": "SPORTS TAPE",
            "brand": "CAPTAIN",
            "category": "Sports Tape",
            "model_code": "CP-ST-01",
            "description": "Professional sports tape for injury prevention and support with strong adhesive and breathable material.",
            "specifications": {
                "material": "Cotton fabric with zinc oxide adhesive",
                "width": "Multiple widths available (1.5cm, 2.5cm, 5cm)",
                "length": "10 meters per roll",
                "adhesive": "Medical-grade zinc oxide adhesive"
            },
            "features": ["Medical Grade Adhesive", "Breathable Cotton", "Multiple Widths", "Professional Quality", "Injury Prevention"],
            "colors": ["White", "Beige"],
            "sizes": ["1.5cm x 10m", "2.5cm x 10m", "5cm x 10m"],
            "images": ["/images/products/captain/tape/sports-tape-1.jpg", "/images/products/captain/tape/sports-tape-2.jpg"],
            "price_range": "Contact for pricing",
            "is_active": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        },
        {
            "id": str(uuid.uuid4()),
            "name": "BOXING TAPE",
            "brand": "CAPTAIN",
            "category": "Sports Tape",
            "model_code": "CP-BT-01",
            "description": "Specialized boxing tape for hand wrapping with superior adhesion and hand protection properties.",
            "specifications": {
                "material": "Cotton fabric with enhanced adhesive",
                "width": "2.5cm standard boxing width",
                "length": "4.5 meters per roll",
                "adhesive": "Enhanced grip adhesive for boxing applications"
            },
            "features": ["Boxing Optimized", "Enhanced Adhesive", "Standard Boxing Width", "Hand Protection", "Professional Quality"],
            "colors": ["White", "Black", "Red"],
            "sizes": ["2.5cm x 4.5m"],
            "images": ["/images/products/captain/tape/boxing-tape-1.jpg", "/images/products/captain/tape/boxing-tape-2.jpg"],
            "price_range": "Contact for pricing",
            "is_active": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        },
        
        # Water Bottles
        {
            "id": str(uuid.uuid4()),
            "name": "SPORTS WATER BOTTLE",
            "brand": "CAPTAIN",
            "category": "Water Bottles",
            "model_code": "CP-WB-750",
            "description": "BPA-free sports water bottle with ergonomic design and leak-proof cap for hydration during sports activities.",
            "specifications": {
                "capacity": "750ml",
                "material": "BPA-free food grade plastic",
                "cap": "Leak-proof sports cap with pull mechanism",
                "design": "Ergonomic grip with measurement markings"
            },
            "features": ["BPA-Free Material", "Leak-Proof Cap", "Ergonomic Design", "Measurement Markings", "Sports Optimized"],
            "colors": ["Blue", "Green", "Red", "Black", "Clear"],
            "sizes": ["750ml"],
            "images": ["/images/products/captain/bottles/sports-bottle-1.jpg", "/images/products/captain/bottles/sports-bottle-2.jpg"],
            "price_range": "Contact for pricing",
            "is_active": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        },
        
        # Sports Socks
        {
            "id": str(uuid.uuid4()),
            "name": "SOFT TOUCH SPORTS SOCKS",
            "brand": "CAPTAIN",
            "category": "Sports Socks",
            "model_code": "CP-SPSS-SOFT",
            "description": "Comfortable sports socks with soft touch fabric and moisture-wicking properties for all-day comfort.",
            "specifications": {
                "material": "Cotton-polyester blend with moisture-wicking fibers",
                "construction": "Cushioned sole with reinforced heel and toe",
                "fit": "Athletic fit with arch support",
                "length": "Crew length design"
            },
            "features": ["Soft Touch Fabric", "Moisture Wicking", "Cushioned Sole", "Arch Support", "All-Day Comfort"],
            "colors": ["White", "Black", "Grey", "Navy"],
            "sizes": ["S", "M", "L", "XL"],
            "images": ["/images/products/captain/socks/soft-touch-1.jpg", "/images/products/captain/socks/soft-touch-2.jpg"],
            "price_range": "Contact for pricing",
            "is_active": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
    ]
    
    # Insert CAPTAIN products into database
    if captain_products:
        result = await db.products.insert_many(captain_products)
        print(f"✅ Successfully inserted {len(result.inserted_ids)} CAPTAIN products!")
        
        # Display summary by category
        soccer_socks = len([p for p in captain_products if p['category'] == 'Soccer Socks'])
        shin_guards = len([p for p in captain_products if p['category'] == 'Shin Guards'])
        captain_bands = len([p for p in captain_products if p['category'] == 'Captain Bands'])
        jump_ropes = len([p for p in captain_products if p['category'] == 'Jump Ropes'])
        protective_gear = len([p for p in captain_products if p['category'] == 'Protective Gear'])
        sports_tape = len([p for p in captain_products if p['category'] == 'Sports Tape'])
        water_bottles = len([p for p in captain_products if p['category'] == 'Water Bottles'])
        sports_socks = len([p for p in captain_products if p['category'] == 'Sports Socks'])
        
        print(f"\n📊 CAPTAIN Products Summary:")
        print(f"   ⚽ Soccer Socks: {soccer_socks} products")
        print(f"   🛡️ Shin Guards: {shin_guards} products")
        print(f"   🎽 Captain Bands: {captain_bands} products")
        print(f"   🪢 Jump Ropes: {jump_ropes} products")
        print(f"   🦵 Protective Gear: {protective_gear} products")
        print(f"   🏥 Sports Tape: {sports_tape} products")
        print(f"   💧 Water Bottles: {water_bottles} products")
        print(f"   🧦 Sports Socks: {sports_socks} products")
        print(f"   📦 Total CAPTAIN Products: {len(captain_products)}")
        
    else:
        print("❌ No CAPTAIN products to insert")
    
    client.close()
    print("🎉 CAPTAIN products integration completed successfully!")

if __name__ == "__main__":
    asyncio.run(seed_captain_products())