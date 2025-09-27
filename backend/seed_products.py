#!/usr/bin/env python3
"""
Seed script to populate the Akaz Sports Hub database with products from the catalogues
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

async def seed_products():
    """Seed the database with products from all three catalogues"""
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    print("🌱 Starting to seed Akaz Sports Hub products...")
    
    # Clear existing products
    await db.products.delete_many({})
    print("🗑️  Cleared existing products")
    
    # GOWIN Products (Sports Footwear)
    gowin_products = [
        # Cricket Shoes
        {
            "id": str(uuid.uuid4()),
            "name": "NITRO",
            "brand": "GOWIN",
            "category": "Cricket Shoes",
            "model_code": "GW-CR-NITRO",
            "description": "Premium cricket shoes with correct heel support, lightweight design, and flexible shock absorbing EVA midsole.",
            "specifications": {
                "heel_support": "Thick and soft molded TPU heel cup",
                "upper": "Premium PU Upper with foam-padded side cage",
                "midsole": "EVA Midsole for flexibility and shock absorption",
                "insole": "High-quality molded insole",
                "outsole": "Lightweight EVA midsole"
            },
            "features": ["Correct Heel Support", "Lightweight", "Flexible Shock Absorbing", "Increased Comfort", "Embossed Logo"],
            "colors": ["Sea Green/White", "White/Red", "White/Velvet Pine"],
            "sizes": ["5", "6", "7", "8", "9", "10", "11", "12"],
            "images": ["/images/products/gowin/cricket/nitro-1.jpg", "/images/products/gowin/cricket/nitro-2.jpg"],
            "price_range": "Contact for pricing",
            "is_active": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        },
        {
            "id": str(uuid.uuid4()),
            "name": "TYRO",
            "brand": "GOWIN",
            "category": "Cricket Shoes",
            "model_code": "GW-CR-TYRO",
            "description": "All-white cricket shoes with dotted synthetic leather upper and memory foam insole for enhanced comfort.",
            "specifications": {
                "heel_support": "Thick and soft molded TPU heel cup",
                "upper": "Dotted synthetic leather upper with foam-padded side cage",
                "midsole": "EVA Midsole for flexibility and shock absorption",
                "insole": "High-quality memory foam insole",
                "outsole": "Lightweight EVA midsole"
            },
            "features": ["Correct Heel Support", "Lightweight", "Flexible Shock Absorbing", "Memory Foam Comfort", "Embossed Design"],
            "colors": ["All White", "White/Island Blue"],
            "sizes": ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"],
            "images": ["/images/products/gowin/cricket/tyro-1.jpg", "/images/products/gowin/cricket/tyro-2.jpg"],
            "price_range": "Contact for pricing",
            "is_active": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        },
        # Football Shoes
        {
            "id": str(uuid.uuid4()),
            "name": "META",
            "brand": "GOWIN",
            "category": "Football Shoes",
            "model_code": "GW-FB-META",
            "description": "NEW premium football shoes with micro fiber upper and 13 molded studs for firm ground play.",
            "specifications": {
                "heel_support": "Thick and soft molded TPU heel cup",
                "upper": "Premium Micro Fiber Upper with foam-padded side cage",
                "outsole": "TPU Out Sole with high tolerance to abrasion",
                "studs": "13 Molded Studs configured for firm ground",
                "insole": "High-quality power cushion insole"
            },
            "features": ["Embossed Logo", "Correct Heel Support", "Lightweight", "Flexible TPU Outsole", "Increased Comfort"],
            "colors": ["White", "Black"],
            "sizes": ["3", "4", "5", "6", "7", "8", "9", "10"],
            "images": ["/images/products/gowin/football/meta-1.jpg", "/images/products/gowin/football/meta-2.jpg"],
            "price_range": "Contact for pricing",
            "is_active": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        },
        {
            "id": str(uuid.uuid4()),
            "name": "PHOENIX",
            "brand": "GOWIN",
            "category": "Football Shoes",
            "model_code": "GW-FB-PHOENIX",
            "description": "NEW football shoes with synthetic leather upper and 24 molded studs for superior grip on firm ground.",
            "specifications": {
                "heel_support": "Thick and soft molded TPU heel cup",
                "upper": "Premium Synthetic Leather Upper with foam-padded side cage",
                "outsole": "TPU Out Sole with high tolerance to abrasion",
                "studs": "24 Molded Studs configured for firm ground",
                "insole": "High-quality power cushion insole"
            },
            "features": ["Embossed Logo", "Correct Heel Support", "Lightweight", "Flexible TPU Outsole", "Increased Comfort"],
            "colors": ["White/Gold", "White/Lime", "White/Silver"],
            "sizes": ["3", "4", "5", "6", "7", "8", "9", "10"],
            "images": ["/images/products/gowin/football/phoenix-1.jpg", "/images/products/gowin/football/phoenix-2.jpg"],
            "price_range": "Contact for pricing",
            "is_active": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        },
        # Badminton Shoes
        {
            "id": str(uuid.uuid4()),
            "name": "FEATHER",
            "brand": "GOWIN",
            "category": "Badminton Shoes",
            "model_code": "GW-BD-FEATHER",
            "description": "NEW lightweight badminton shoes with high-density print mesh upper and TPU shank for stability.",
            "specifications": {
                "heel_support": "Thick and soft molded TPU heel cup",
                "upper": "Premium Mesh upper with High Density Print, feather weight",
                "shank": "TPU Shank for stability and lesser exhaustion",
                "insole": "High-quality power cushion insole",
                "outsole": "Lightweight EVA midsole"
            },
            "features": ["High Density Raise Print", "Correct Heel Support", "Featherweight", "TPU Shank", "High Performance"],
            "colors": ["Tiffany Blue/Yellow", "Grey/Tiffany Blue", "Black/Gold"],
            "sizes": ["5", "6", "7", "8", "9", "10", "11"],
            "images": ["/images/products/gowin/badminton/feather-1.jpg", "/images/products/gowin/badminton/feather-2.jpg"],
            "price_range": "Contact for pricing",
            "is_active": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        },
        # Running Shoes
        {
            "id": str(uuid.uuid4()),
            "name": "RACER",
            "brand": "GOWIN",
            "category": "Running Shoes",
            "model_code": "GW-RN-RACER",
            "description": "NEW featherweight running shoes with high-density print mesh upper and EVA sole for shock absorption.",
            "specifications": {
                "heel_support": "Thick and soft molded TPU heel cup",
                "upper": "Premium Mesh upper with High Density Print, featherweight design",
                "sole": "EVA Sole for shock absorption",
                "insole": "High-quality power cushion insole",
                "midsole": "Lightweight EVA midsole"
            },
            "features": ["High Density Raise Print", "Correct Heel Support", "Featherweight", "Flexible Shock Absorbing", "Lightweight"],
            "colors": ["Tiffany Blue", "Black", "Grey"],
            "sizes": ["5", "6", "7", "8", "9", "10", "11"],
            "images": ["/images/products/gowin/running/racer-1.jpg", "/images/products/gowin/running/racer-2.jpg"],
            "price_range": "Contact for pricing",
            "is_active": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        },
    ]
    
    # TRIUMPH Products (Cricket Equipment & Bags)
    triumph_products = [
        # Cricket Bags
        {
            "id": str(uuid.uuid4()),
            "name": "FULLY PADDED COFFIN BAG",
            "brand": "TRIUMPH",
            "category": "Cricket Bags",
            "model_code": "TR-KB-10000",
            "description": "Player Edition cricket wheel bag with easy-roll heavy tractor wheels and multiple compartments.",
            "specifications": {
                "length": "106cm",
                "height": "44cm", 
                "width": "42cm",
                "construction": "Durable nylon construction",
                "wheels": "Easy-roll heavy tractor wheels"
            },
            "features": [
                "Hard Base Compartment",
                "Fits and protects oversized equipment easily",
                "Full padding for added protection",
                "2 large Internal Compartments",
                "1 External pocket with silver insulation inside",
                "4 External pockets",
                "1 Mirror pocket on top for label display"
            ],
            "colors": ["Player Edition"],
            "sizes": ["Standard"],
            "images": ["/images/products/triumph/bags/coffin-bag-1.jpg", "/images/products/triumph/bags/coffin-bag-2.jpg"],
            "price_range": "Contact for pricing",
            "is_active": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        },
        {
            "id": str(uuid.uuid4()),
            "name": "HULK",
            "brand": "TRIUMPH",
            "category": "Cricket Bags",
            "model_code": "TR-KB-5000",
            "description": "Fully padded cricket bag with easy-roll tractor wheels and external bat pocket.",
            "specifications": {
                "length": "94cm",
                "height": "46cm",
                "width": "41cm",
                "construction": "Durable nylon construction",
                "wheels": "Easy-roll tractor wheels"
            },
            "features": [
                "Hard Base Compartment",
                "Fits and protects oversized equipment easily", 
                "Full padding for added protection",
                "2 External pockets with silver insulation inside",
                "1 External pocket",
                "1 External Bat Pocket to carry 3-4 bats",
                "1 Large internal pocket"
            ],
            "colors": ["Black/Golden"],
            "sizes": ["Standard"],
            "images": ["/images/products/triumph/bags/hulk-1.jpg", "/images/products/triumph/bags/hulk-2.jpg"],
            "price_range": "Contact for pricing",
            "is_active": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        },
        # Cricket Accessories
        {
            "id": str(uuid.uuid4()),
            "name": "KNIGHT (TITANIUM) HELMET",
            "brand": "TRIUMPH",
            "category": "Cricket Accessories",
            "model_code": "TR-CH-701",
            "description": "Premium cricket helmet with titanium grill and high impact resistant ABS shell.",
            "specifications": {
                "sizes": "XS TO XL",
                "grill": "TITANIUM GRILL",
                "outer_shell": "High Impact Resistant Regular ABS shell covered with Matty cloth",
                "inner_mesh": "Shock Resistant, Sweat Absorbent, Breathable U Foam lining",
                "padding": "High density Double Layer EVA foam padding for superior cushioning"
            },
            "features": ["Titanium Grill", "High Impact Resistant", "Sweat Absorbent", "Superior Cushioning", "Professional Grade"],
            "colors": ["Standard"],
            "sizes": ["XS", "S", "M", "L", "XL"],
            "images": ["/images/products/triumph/cricket/knight-helmet-1.jpg", "/images/products/triumph/cricket/knight-helmet-2.jpg"],
            "price_range": "Contact for pricing",
            "is_active": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        },
        # Badminton Equipment
        {
            "id": str(uuid.uuid4()),
            "name": "LEGEND-5000 RACKET",
            "brand": "TRIUMPH",
            "category": "Badminton Equipment",
            "model_code": "TR-BR-01",
            "description": "Unipiece badminton racket with wide body, full alloy construction and PU grip.",
            "specifications": {
                "construction": "Unipiece Wide Body, Full Alloy",
                "grip": "PU Grip",
                "strings": "Sheep Gut",
                "cover": "Full Foam Cover (Mat Finish)",
                "type": "Professional Grade"
            },
            "features": ["Unipiece Construction", "Wide Body Design", "Full Alloy Frame", "Premium PU Grip", "Mat Finish"],
            "colors": ["Black/Yellow"],
            "sizes": ["Standard"],
            "images": ["/images/products/triumph/badminton/legend-5000-1.jpg", "/images/products/triumph/badminton/legend-5000-2.jpg"],
            "price_range": "Contact for pricing",
            "is_active": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        },
    ]
    
    # BABBLER Products (Fitness & Athletic Gear)
    babbler_products = [
        # Gym Gloves
        {
            "id": str(uuid.uuid4()),
            "name": "MITSUKO",
            "brand": "BABBLER",
            "category": "Gym Gloves",
            "model_code": "BB-BG-202",
            "description": "Premium all-leather gym gloves with PU leather palm and 23\" long neoprene wrist wrap for maximum stability.",
            "specifications": {
                "material": "All Leather with PU Leather Palm",
                "wrist_wrap": "Extra Long 23\" Neoprene Wrist Wrap",
                "design": "Ergonomically Cut Palm Pad",
                "padding": "Ergo Soft Padding",
                "stitching": "Double Stitching"
            },
            "features": ["Soft Grip Design", "Maximum Stability", "Ergonomic Palm Pad", "Pull Off Tabs", "Technically Advanced"],
            "colors": ["Premium Leather"],
            "sizes": ["Medium", "Large", "X-Large"],
            "images": ["/images/products/babbler/gloves/mitsuko-1.jpg", "/images/products/babbler/gloves/mitsuko-2.jpg"],
            "price_range": "Contact for pricing",
            "is_active": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        },
        {
            "id": str(uuid.uuid4()),
            "name": "KAKAPO",
            "brand": "BABBLER",
            "category": "Gym Gloves",
            "model_code": "BB-BG-201",
            "description": "Gym gloves with PU leather palm and printed Lycra back for enhanced grip and comfort.",
            "specifications": {
                "palm": "PU Leather Palm",
                "back": "Printed Lycra Back",
                "design": "Ergonomic Design",
                "comfort": "Enhanced Grip and Comfort"
            },
            "features": ["PU Leather Palm", "Printed Lycra Back", "Enhanced Grip", "Comfortable Fit", "Durable Construction"],
            "colors": ["Black", "Brown", "Green"],
            "sizes": ["Small", "Medium", "Large", "X-Large"],
            "images": ["/images/products/babbler/gloves/kakapo-1.jpg", "/images/products/babbler/gloves/kakapo-2.jpg"],
            "price_range": "Contact for pricing",
            "is_active": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        },
        # Gym Belts
        {
            "id": str(uuid.uuid4()),
            "name": "SOFTER",
            "brand": "BABBLER",
            "category": "Gym Belts",
            "model_code": "BB-GB-401",
            "description": "4\" lightweight foam padded gym belt with Velcro fastener, export quality construction.",
            "specifications": {
                "width": "4 inches",
                "padding": "Light Weight Foam Padded",
                "fastener": "Velcro Fastener",
                "quality": "Export Quality"
            },
            "features": ["Lightweight", "Foam Padded", "Velcro Fastener", "Export Quality", "Professional Grade"],
            "colors": ["Black"],
            "sizes": ["Small", "Medium", "Large", "XL", "XXL"],
            "images": ["/images/products/babbler/belts/softer-1.jpg", "/images/products/babbler/belts/softer-2.jpg"],
            "price_range": "Contact for pricing",
            "is_active": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        },
        # Support Gear
        {
            "id": str(uuid.uuid4()),
            "name": "WRIST SUPPORT NEOPRENE",
            "brand": "BABBLER",
            "category": "Support Gear",
            "model_code": "BB-BWS-1102",
            "description": "Neoprene wrist support with Velcro elastic for better grip and comfort during workouts.",
            "specifications": {
                "material": "Neoprene",
                "fastening": "Velcro Elastic",
                "design": "Ergonomic Support Design",
                "comfort": "Enhanced Grip"
            },
            "features": ["Neoprene Material", "Velcro Elastic", "Better Grip", "Enhanced Comfort", "Breathable"],
            "colors": ["Orange/Black", "Black"],
            "sizes": ["One Size Fits Most"],
            "images": ["/images/products/babbler/support/wrist-neoprene-1.jpg", "/images/products/babbler/support/wrist-neoprene-2.jpg"],
            "price_range": "Contact for pricing",
            "is_active": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        },
        # Boxing Equipment
        {
            "id": str(uuid.uuid4()),
            "name": "RAGE PUNCHING BAG",
            "brand": "BABBLER",
            "category": "Boxing Equipment",
            "model_code": "BB-BX-143",
            "description": "Double coated fabric punching bag with cotton filling, available in multiple sizes.",
            "specifications": {
                "material": "Double Coated Fabric",
                "filling": "Cotton Filled",
                "construction": "Heavy Duty",
                "durability": "Professional Grade"
            },
            "features": ["Double Coated Fabric", "Cotton Filled", "Heavy Duty Construction", "Multiple Sizes", "Professional Grade"],
            "colors": ["Black/Red"],
            "sizes": ["24\"", "30\"", "36\"", "42\"", "48\""],
            "images": ["/images/products/babbler/boxing/rage-bag-1.jpg", "/images/products/babbler/boxing/rage-bag-2.jpg"],
            "price_range": "Contact for pricing",
            "is_active": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        },
        # Fitness Accessories
        {
            "id": str(uuid.uuid4()),
            "name": "PREMIUM SKIPPING ROPE",
            "brand": "BABBLER",
            "category": "Fitness Accessories",
            "model_code": "BB-BS-500",
            "description": "7MM black rope with colored lining PVC handle with ball bearing for smooth rotation.",
            "specifications": {
                "rope_thickness": "7MM",
                "handle": "PVC Handle with Ball Bearing",
                "color": "Black with Colored Lining",
                "bearing": "Ball Bearing System"
            },
            "features": ["Ball Bearing", "PVC Grip", "Smooth Rotation", "Extra Comfort", "Professional Grade"],
            "colors": ["Black/Orange", "Black/Green", "Black/Red"],
            "sizes": ["Standard Length"],
            "images": ["/images/products/babbler/accessories/skipping-rope-1.jpg", "/images/products/babbler/accessories/skipping-rope-2.jpg"],
            "price_range": "Contact for pricing",
            "is_active": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        },
    ]
    
    # Combine all products
    all_products = gowin_products + triumph_products + babbler_products
    
    # Insert products into database
    if all_products:
        result = await db.products.insert_many(all_products)
        print(f"✅ Successfully inserted {len(result.inserted_ids)} products!")
        
        # Display summary by brand
        gowin_count = len(gowin_products)
        triumph_count = len(triumph_products) 
        babbler_count = len(babbler_products)
        
        print(f"\n📊 Products Summary:")
        print(f"   🥅 GOWIN (Sports Footwear): {gowin_count} products")
        print(f"   🏏 TRIUMPH (Cricket & Sports Equipment): {triumph_count} products")
        print(f"   💪 BABBLER (Fitness & Athletic Gear): {babbler_count} products")
        print(f"   📦 Total Products: {len(all_products)}")
        
    else:
        print("❌ No products to insert")
    
    await client.close()
    print("🎉 Database seeding completed successfully!")

if __name__ == "__main__":
    asyncio.run(seed_products())